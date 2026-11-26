import type { CalibrationKind, CalibrationResult, Prisma } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import { hasPermission, requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import { checkFile, readStoredFile, saveFile, sha256, type StoredFile } from "@/server/storage";
import type { TenantDb } from "@/server/db/tenant-client";
import { reportDeviation } from "../deviations/service";
import { nextCode, parseDay, requireText, withCodeRetry } from "../quality/shared";
import { addMonthsUtc, loadEquipment, setOutOfService } from "./equipment";
import { evaluatePoints, finalCalibrationResult, type PointInput } from "./rules";

export const CALIBRATION_ENTITY = "Calibration";

export function listCalibrations(
  db: TenantDb,
  filter: { q?: string; status?: "RECORDED" | "APPROVED" | "REJECTED" } = {},
) {
  const q = filter.q?.trim();
  return db.calibration.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q.toUpperCase() } },
              { certificateNumber: { contains: q } },
              { equipment: { code: { contains: q.toUpperCase() } } },
            ],
          }
        : {}),
    },
    include: { equipment: { select: { id: true, code: true, name: true } } },
    orderBy: { calibratedAt: "desc" },
    take: 300,
  });
}

export async function getCalibration(db: TenantDb, id: string) {
  const cal = await db.calibration.findUnique({ where: { id }, include: { equipment: true } });
  if (!cal) return null;
  const standardIds = Array.isArray(cal.referenceStandardIds)
    ? (cal.referenceStandardIds as string[])
    : [];
  const [standards, signatures, users] = await Promise.all([
    db.equipment.findMany({
      where: { id: { in: standardIds } },
      select: {
        id: true,
        code: true,
        name: true,
        lastCalibrationAt: true,
        nextCalibrationDue: true,
      },
    }),
    db.electronicSignature.findMany({
      where: { entityType: CALIBRATION_ENTITY, entityId: id },
      orderBy: { signedAt: "asc" },
    }),
    db.user.findMany({
      where: { id: { in: [cal.recordedById, cal.approvedById].filter((x): x is string => !!x) } },
      select: { id: true, fullName: true },
    }),
  ]);
  const deviation = cal.deviationId
    ? await db.deviation.findUnique({
        where: { id: cal.deviationId },
        select: { id: true, code: true, status: true },
      })
    : null;
  return {
    ...cal,
    standards,
    signatures,
    deviation,
    recordedBy: users.find((u) => u.id === cal.recordedById),
    approvedBy: users.find((u) => u.id === cal.approvedById),
  };
}

export type CalibrationInput = {
  equipmentId: string;
  kind: CalibrationKind;
  provider?: string | null;
  accreditation?: string | null;
  certificateNumber?: string | null;
  calibratedAt: string;
  points: PointInput[];
  referenceStandardIds: string[];
  declaredResult?: CalibrationResult | null;
  comments?: string | null;
  impactAssessment?: string | null;
  file?: { name: string; data: Buffer } | null;
};

/**
 * Registro de una calibración (METROLOGY_MANAGE).
 * - Externa: proveedor, número de certificado y archivo del certificado obligatorios.
 * - Interna: al menos un patrón, vigente en la fecha de calibración (trazabilidad metrológica).
 * - Con EMP en el equipo, la conformidad la calcula la regla de decisión; sin EMP, la declara la persona.
 * - No conforme: exige evaluación de impacto y deja el equipo FUERA DE SERVICIO de inmediato.
 */
export async function recordCalibration(ctx: ServiceContext, input: CalibrationInput) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const equipment = await loadEquipment(ctx.db, input.equipmentId);
  if (equipment.status === "RETIRED") throw new ServiceError("invalid_state");
  const calibratedAt = await parseDay(ctx, input.calibratedAt, { notFuture: true });
  if (
    input.points.length === 0 ||
    input.points.some(
      (p) => ![p.nominal, p.reading, p.uncertainty].every(Number.isFinite) || p.uncertainty < 0,
    )
  ) {
    throw new ServiceError("calibration_points_invalid");
  }

  const standardIds = [...new Set(input.referenceStandardIds)].filter((id) => id !== equipment.id);
  if (input.kind === "EXTERNAL") {
    if (!input.provider?.trim() || !input.certificateNumber?.trim())
      throw new ServiceError("certificate_data_required");
    if (!input.file) throw new ServiceError("file_required");
  } else {
    if (standardIds.length === 0) throw new ServiceError("reference_standard_required");
    const standards = await ctx.db.equipment.findMany({ where: { id: { in: standardIds } } });
    if (standards.length !== standardIds.length) throw new ServiceError("not_found");
    for (const s of standards) {
      if (!s.isReferenceStandard || s.status === "RETIRED")
        throw new ServiceError("not_a_reference_standard");
      const valid =
        s.lastCalibrationAt &&
        s.nextCalibrationDue &&
        s.lastCalibrationAt <= calibratedAt &&
        s.nextCalibrationDue >= calibratedAt;
      if (!valid) throw new ServiceError("reference_standard_not_traceable");
    }
  }

  const evaluated = evaluatePoints(input.points, equipment.maxPermissibleError);
  const result = finalCalibrationResult(evaluated.computed, input.declaredResult ?? null);
  if (!result) throw new ServiceError("calibration_result_required");
  const impactAssessment = input.impactAssessment?.trim() || null;
  if (result === "NON_CONFORM" && (!impactAssessment || impactAssessment.length < 10))
    throw new ServiceError("impact_assessment_required");

  let stored: StoredFile | null = null;
  if (input.file) {
    const check = checkFile(input.file.name, input.file.data);
    if ("error" in check) throw new ServiceError(check.error);
    stored = await saveFile(ctx.actor.organizationId, input.file.name, input.file.data);
  }

  return withCodeRetry(() =>
    ctx.db.$transaction(async (tx) => {
      const code = await nextCode(tx, "calibration", "CAL");
      const cal = await tx.calibration.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          equipmentId: equipment.id,
          kind: input.kind,
          provider: input.provider?.trim() || null,
          accreditation: input.accreditation?.trim() || null,
          certificateNumber: input.certificateNumber?.trim() || null,
          calibratedAt,
          points: evaluated.points as unknown as Prisma.InputJsonValue,
          unit: equipment.unit,
          referenceStandardIds: input.kind === "INTERNAL" ? standardIds : [],
          result,
          computedResult: evaluated.computed,
          comments: input.comments?.trim() || null,
          impactAssessment,
          recordedById: ctx.actor.id,
          ...(stored
            ? {
                fileName: stored.fileName,
                fileMime: stored.mime,
                fileSize: stored.size,
                fileSha256: stored.sha256,
                storageKey: stored.storageKey,
              }
            : {}),
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "calibration.record",
          entityType: CALIBRATION_ENTITY,
          entityId: cal.id,
          after: {
            code,
            equipment: equipment.code,
            kind: input.kind,
            result,
            computedResult: evaluated.computed,
            certificate: cal.certificateNumber,
            fileSha256: stored?.sha256 ?? null,
          },
        },
        tx,
      );
      if (result === "NON_CONFORM")
        await setOutOfService(ctx, tx, equipment.id, `${code}: calibración no conforme`);
      return cal;
    }),
  );
}

export type ApprovalInput = { decision: "approve" | "reject"; comment?: string; password: string };

/**
 * Aprobación de la calibración (METROLOGY_APPROVE, distinto de quien la registró). Al aprobar se
 * actualizan la última calibración y el próximo vencimiento; si es conforme, el equipo vuelve a servicio.
 */
export async function approveCalibration(ctx: ServiceContext, id: string, input: ApprovalInput) {
  await requirePermission(ctx, "METROLOGY_APPROVE");
  const cal = await ctx.db.calibration.findUnique({ where: { id } });
  if (!cal) throw new ServiceError("not_found");
  if (cal.status !== "RECORDED") throw new ServiceError("invalid_state");
  if (cal.recordedById === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const reject = input.decision === "reject";
  const comment = reject
    ? requireText(input.comment, "reason_required", 5)
    : input.comment?.trim() || null;
  const meaning = reject ? "REJECTED" : "APPROVED";
  const signer = await verifySigner(ctx, input.password, {
    meaning,
    entityType: CALIBRATION_ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const fresh = await tx.calibration.findUnique({ where: { id } });
    if (fresh?.status !== "RECORDED") throw new ServiceError("invalid_state");
    const updated = await tx.calibration.update({
      where: { id },
      data: reject
        ? { status: "REJECTED", rejectionReason: comment }
        : { status: "APPROVED", approvedById: ctx.actor.id, approvedAt: new Date() },
    });
    await recordSignature(ctx, tx, signer, {
      meaning,
      entityType: CALIBRATION_ENTITY,
      entityId: id,
      contentHash: cal.fileSha256,
      comment,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: reject ? "calibration.reject" : "calibration.approve",
        entityType: CALIBRATION_ENTITY,
        entityId: id,
        before: { status: "RECORDED" },
        after: { status: updated.status },
        reason: comment ?? undefined,
      },
      tx,
    );

    if (!reject) {
      const equipment = await loadEquipment(tx, cal.equipmentId);
      // Solo una calibración más reciente que la vigente mueve las fechas.
      if (!equipment.lastCalibrationAt || cal.calibratedAt >= equipment.lastCalibrationAt) {
        const nextCalibrationDue = equipment.calibrationIntervalMonths
          ? addMonthsUtc(cal.calibratedAt, equipment.calibrationIntervalMonths)
          : null;
        const backInService = cal.result !== "NON_CONFORM" && equipment.status === "OUT_OF_SERVICE";
        await tx.equipment.update({
          where: { id: equipment.id },
          data: {
            lastCalibrationAt: cal.calibratedAt,
            nextCalibrationDue,
            ...(backInService ? { status: "IN_SERVICE", statusReason: null } : {}),
          },
        });
        await logAudit(
          {
            ...auditBase(ctx),
            action: "equipment.calibration_dates",
            entityType: "Equipment",
            entityId: equipment.id,
            before: {
              lastCalibrationAt: equipment.lastCalibrationAt,
              nextCalibrationDue: equipment.nextCalibrationDue,
              status: equipment.status,
            },
            after: {
              lastCalibrationAt: cal.calibratedAt,
              nextCalibrationDue,
              status: backInService ? "IN_SERVICE" : equipment.status,
            },
            reason: cal.code,
          },
          tx,
        );
      }
    }
    return updated;
  });
}

/** Abre una desviación (categoría Equipo) desde una calibración no conforme y la vincula. */
export async function openDeviationFromCalibration(ctx: ServiceContext, id: string) {
  const cal = await ctx.db.calibration.findUnique({ where: { id }, include: { equipment: true } });
  if (!cal) throw new ServiceError("not_found");
  if (cal.result !== "NON_CONFORM") throw new ServiceError("invalid_state");
  if (cal.deviationId) throw new ServiceError("deviation_already_linked");
  if (
    cal.recordedById !== ctx.actor.id &&
    !(await hasPermission(ctx, "METROLOGY_APPROVE")) &&
    !(await hasPermission(ctx, "QA_APPROVE"))
  ) {
    throw new ServiceError("forbidden");
  }
  const tz =
    (
      await ctx.db.organization.findUnique({
        where: { id: ctx.actor.organizationId },
        select: { timezone: true },
      })
    )?.timezone ?? "America/Guayaquil";
  const detectedAt = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(cal.createdAt);
  const deviation = await reportDeviation(ctx, {
    title: `${cal.equipment.code} ${cal.equipment.name}: calibración no conforme (${cal.code})`,
    description: `Calibración ${cal.code} del ${cal.calibratedAt.toISOString().slice(0, 10)} con resultado no conforme frente al EMP del equipo.`,
    category: "EQUIPMENT",
    processId: cal.equipment.processId,
    location: cal.equipment.location,
    detectedAt,
    immediateAction: `Equipo ${cal.equipment.code} retirado de servicio. Evaluación de impacto: ${cal.impactAssessment ?? "pendiente"}`,
  });
  await ctx.db.$transaction(async (tx) => {
    await tx.calibration.update({ where: { id }, data: { deviationId: deviation.id } });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "calibration.deviation_link",
        entityType: CALIBRATION_ENTITY,
        entityId: id,
        after: { deviationId: deviation.id, deviation: deviation.code },
      },
      tx,
    );
  });
  return deviation;
}

/** Descarga del certificado con verificación de integridad y auditoría. */
export async function downloadCalibrationFile(ctx: ServiceContext, id: string) {
  const cal = await ctx.db.calibration.findUnique({
    where: { id },
    include: { equipment: { select: { code: true } } },
  });
  if (!cal?.storageKey || !cal.fileSha256) throw new ServiceError("not_found");
  const data = await readStoredFile(ctx.actor.organizationId, cal.storageKey);
  if (sha256(data) !== cal.fileSha256) throw new ServiceError("file_integrity_error");
  await logAudit({
    ...auditBase(ctx),
    action: "calibration.download",
    entityType: CALIBRATION_ENTITY,
    entityId: id,
  });
  return {
    data,
    fileName: `${cal.code}_${cal.equipment.code}_${cal.fileName}`,
    mime: cal.fileMime ?? "application/octet-stream",
  };
}
