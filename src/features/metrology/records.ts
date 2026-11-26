import type {
  MaintenanceType,
  QualificationPhase,
  QualificationResult,
  VerificationResult,
} from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { addDays } from "@/lib/dates";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import { requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import { checkFile, readStoredFile, saveFile, sha256, type StoredFile } from "@/server/storage";
import type { TenantDb } from "@/server/db/tenant-client";
import { nextCode, parseDay, requireText, withCodeRetry } from "../quality/shared";
import { addMonthsUtc, loadEquipment, setOutOfService } from "./equipment";
import { proficiencyOutcome, zScore } from "./rules";

// ───────────────────────────── Verificaciones intermedias ─────────────────────────────

export type VerificationInput = {
  equipmentId: string;
  performedAt: string;
  method: string;
  readings: string;
  result: VerificationResult;
  comments?: string | null;
};

/** Verificación intermedia firmada (ELABORÓ) por quien la realiza. No conforme → fuera de servicio. */
export async function recordVerification(
  ctx: ServiceContext,
  input: VerificationInput,
  password: string,
) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const equipment = await loadEquipment(ctx.db, input.equipmentId);
  if (equipment.status === "RETIRED") throw new ServiceError("invalid_state");
  const performedAt = await parseDay(ctx, input.performedAt, { notFuture: true });
  const method = requireText(input.method);
  const readings = requireText(input.readings);
  const signer = await verifySigner(ctx, password, {
    meaning: "AUTHORED",
    entityType: "Verification",
    entityId: equipment.id,
  });
  return ctx.db.$transaction(async (tx) => {
    const v = await tx.verification.create({
      data: {
        organizationId: ctx.actor.organizationId,
        equipmentId: equipment.id,
        performedAt,
        performedById: ctx.actor.id,
        method,
        readings,
        result: input.result,
        comments: input.comments?.trim() || null,
      },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "AUTHORED",
      entityType: "Verification",
      entityId: v.id,
      contentHash: sha256(`${method}|${readings}|${input.result}`),
    });
    const isLatest = !equipment.lastVerificationAt || performedAt >= equipment.lastVerificationAt;
    if (isLatest) {
      await tx.equipment.update({
        where: { id: equipment.id },
        data: {
          lastVerificationAt: performedAt,
          nextVerificationDue: equipment.verificationIntervalDays
            ? addDays(performedAt, equipment.verificationIntervalDays)
            : null,
        },
      });
    }
    await logAudit(
      {
        ...auditBase(ctx),
        action: "verification.record",
        entityType: "Equipment",
        entityId: equipment.id,
        after: { verificationId: v.id, result: input.result, performedAt },
      },
      tx,
    );
    if (input.result === "NON_CONFORM")
      await setOutOfService(ctx, tx, equipment.id, "Verificación intermedia no conforme");
    return v;
  });
}

// ───────────────────────────── Mantenimiento ─────────────────────────────

export type MaintenanceInput = {
  equipmentId: string;
  type: MaintenanceType;
  performedAt: string;
  performedBy: string;
  description: string;
  requiresRecalibration: boolean;
};

/** Registro de mantenimiento. Si afecta a la medición, el equipo queda fuera de servicio hasta recalibrarlo. */
export async function recordMaintenance(ctx: ServiceContext, input: MaintenanceInput) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const equipment = await loadEquipment(ctx.db, input.equipmentId);
  if (equipment.status === "RETIRED") throw new ServiceError("invalid_state");
  const performedAt = await parseDay(ctx, input.performedAt, { notFuture: true });
  const data = {
    performedBy: requireText(input.performedBy, "required_fields", 2),
    description: requireText(input.description, "required_fields", 5),
  };
  return ctx.db.$transaction(async (tx) => {
    const m = await tx.maintenance.create({
      data: {
        organizationId: ctx.actor.organizationId,
        equipmentId: equipment.id,
        type: input.type,
        performedAt,
        ...data,
        requiresRecalibration: input.requiresRecalibration,
        recordedById: ctx.actor.id,
      },
    });
    const isLatest = !equipment.lastMaintenanceAt || performedAt >= equipment.lastMaintenanceAt;
    await tx.equipment.update({
      where: { id: equipment.id },
      data: {
        ...(isLatest && input.type === "PREVENTIVE"
          ? {
              lastMaintenanceAt: performedAt,
              nextMaintenanceDue: equipment.maintenanceIntervalMonths
                ? addMonthsUtc(performedAt, equipment.maintenanceIntervalMonths)
                : null,
            }
          : {}),
        ...(input.requiresRecalibration ? { nextCalibrationDue: performedAt } : {}),
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "maintenance.record",
        entityType: "Equipment",
        entityId: equipment.id,
        after: {
          maintenanceId: m.id,
          type: input.type,
          performedAt,
          requiresRecalibration: input.requiresRecalibration,
        },
      },
      tx,
    );
    if (input.requiresRecalibration)
      await setOutOfService(ctx, tx, equipment.id, "Requiere recalibración tras mantenimiento");
    return m;
  });
}

export function listMaintenance(db: TenantDb) {
  return db.maintenance.findMany({
    include: { equipment: { select: { id: true, code: true, name: true } } },
    orderBy: { performedAt: "desc" },
    take: 300,
  });
}

export function listVerifications(db: TenantDb) {
  return db.verification.findMany({
    include: { equipment: { select: { id: true, code: true, name: true } } },
    orderBy: { performedAt: "desc" },
    take: 300,
  });
}

// ───────────────────────────── Calificaciones ─────────────────────────────

export type QualificationInput = {
  equipmentId: string;
  phase: QualificationPhase;
  protocolRef: string;
  executedAt: string;
  result: QualificationResult;
  summary: string;
  file: { name: string; data: Buffer } | null;
};

/** Registro de una calificación DQ/IQ/OQ/PQ con su informe (pendiente de aprobación de QA). */
export async function recordQualification(ctx: ServiceContext, input: QualificationInput) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const equipment = await loadEquipment(ctx.db, input.equipmentId);
  const executedAt = await parseDay(ctx, input.executedAt, { notFuture: true });
  const protocolRef = requireText(input.protocolRef, "required_fields", 2);
  const summary = requireText(input.summary, "required_fields", 10);
  if (!input.file) throw new ServiceError("file_required");
  const check = checkFile(input.file.name, input.file.data);
  if ("error" in check) throw new ServiceError(check.error);
  const stored: StoredFile = await saveFile(
    ctx.actor.organizationId,
    input.file.name,
    input.file.data,
  );
  return withCodeRetry(() =>
    ctx.db.$transaction(async (tx) => {
      const code = await nextCode(tx, "qualification", "QUAL");
      const q = await tx.qualification.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          equipmentId: equipment.id,
          phase: input.phase,
          protocolRef,
          executedAt,
          result: input.result,
          summary,
          fileName: stored.fileName,
          fileMime: stored.mime,
          fileSize: stored.size,
          fileSha256: stored.sha256,
          storageKey: stored.storageKey,
          recordedById: ctx.actor.id,
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "qualification.record",
          entityType: "Qualification",
          entityId: q.id,
          after: {
            code,
            equipment: equipment.code,
            phase: input.phase,
            result: input.result,
            fileSha256: stored.sha256,
          },
        },
        tx,
      );
      if (input.result === "FAIL")
        await setOutOfService(
          ctx,
          tx,
          equipment.id,
          `${code}: calificación ${input.phase} no superada`,
        );
      return q;
    }),
  );
}

/** Garantía de Calidad aprueba (APROBÓ) o rechaza la calificación. Nunca quien la registró. */
export async function approveQualification(
  ctx: ServiceContext,
  id: string,
  input: { decision: "approve" | "reject"; comment?: string; password: string },
) {
  await requirePermission(ctx, "QA_APPROVE");
  const q = await ctx.db.qualification.findUnique({ where: { id } });
  if (!q) throw new ServiceError("not_found");
  if (q.status !== "RECORDED") throw new ServiceError("invalid_state");
  if (q.recordedById === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const reject = input.decision === "reject";
  const comment = reject
    ? requireText(input.comment, "reason_required", 5)
    : input.comment?.trim() || null;
  const meaning = reject ? "REJECTED" : "APPROVED";
  const signer = await verifySigner(ctx, input.password, {
    meaning,
    entityType: "Qualification",
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.qualification.update({
      where: { id },
      data: reject
        ? { status: "REJECTED", rejectionReason: comment }
        : { status: "APPROVED", approvedById: ctx.actor.id, approvedAt: new Date() },
    });
    await recordSignature(ctx, tx, signer, {
      meaning,
      entityType: "Qualification",
      entityId: id,
      contentHash: q.fileSha256,
      comment,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: reject ? "qualification.reject" : "qualification.approve",
        entityType: "Qualification",
        entityId: id,
        before: { status: "RECORDED" },
        after: { status: updated.status },
        reason: comment ?? undefined,
      },
      tx,
    );
    return updated;
  });
}

export async function getQualification(db: TenantDb, id: string) {
  const q = await db.qualification.findUnique({
    where: { id },
    include: { equipment: { select: { id: true, code: true, name: true } } },
  });
  if (!q) return null;
  const [signatures, users] = await Promise.all([
    db.electronicSignature.findMany({
      where: { entityType: "Qualification", entityId: id },
      orderBy: { signedAt: "asc" },
    }),
    db.user.findMany({
      where: { id: { in: [q.recordedById, q.approvedById].filter((x): x is string => !!x) } },
      select: { id: true, fullName: true },
    }),
  ]);
  return { ...q, signatures, recordedBy: users.find((u) => u.id === q.recordedById) };
}

export function listQualifications(db: TenantDb) {
  return db.qualification.findMany({
    include: { equipment: { select: { id: true, code: true, name: true } } },
    orderBy: { executedAt: "desc" },
    take: 300,
  });
}

export async function downloadQualificationFile(ctx: ServiceContext, id: string) {
  const q = await ctx.db.qualification.findUnique({
    where: { id },
    include: { equipment: { select: { code: true } } },
  });
  if (!q?.storageKey || !q.fileSha256) throw new ServiceError("not_found");
  const data = await readStoredFile(ctx.actor.organizationId, q.storageKey);
  if (sha256(data) !== q.fileSha256) throw new ServiceError("file_integrity_error");
  await logAudit({
    ...auditBase(ctx),
    action: "qualification.download",
    entityType: "Qualification",
    entityId: id,
  });
  return {
    data,
    fileName: `${q.code}_${q.equipment.code}_${q.fileName}`,
    mime: q.fileMime ?? "application/octet-stream",
  };
}

// ───────────────────────────── Ensayos de aptitud ─────────────────────────────

export type ProficiencyInput = {
  provider: string;
  scheme: string;
  round: string;
  measurand: string;
  equipmentId?: string | null;
  reportedValue?: number | null;
  assignedValue?: number | null;
  sigma?: number | null;
  zScore?: number | null;
  reportDate: string;
  comments?: string | null;
};

/**
 * Resultado de un ensayo de aptitud. z se calcula con (x − X) / σ si hay datos; si no, se usa el z del
 * informe del proveedor. Insatisfactorio (|z| ≥ 3) exige abrir una CAPA (origen: ensayo de aptitud).
 */
export async function recordProficiency(ctx: ServiceContext, input: ProficiencyInput) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  if (input.equipmentId) await loadEquipment(ctx.db, input.equipmentId);
  const reportDate = await parseDay(ctx, input.reportDate, { notFuture: true });
  const hasValues = [input.reportedValue, input.assignedValue, input.sigma].every(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
  let z: number;
  if (hasValues) {
    if (!(input.sigma! > 0)) throw new ServiceError("sigma_invalid");
    z = zScore(input.reportedValue!, input.assignedValue!, input.sigma!);
  } else if (typeof input.zScore === "number" && Number.isFinite(input.zScore)) {
    z = Math.round(input.zScore * 100) / 100;
  } else {
    throw new ServiceError("z_score_required");
  }
  const outcome = proficiencyOutcome(z);
  const data = {
    provider: requireText(input.provider, "required_fields", 2),
    scheme: requireText(input.scheme, "required_fields", 2),
    round: requireText(input.round, "required_fields", 1),
    measurand: requireText(input.measurand, "required_fields", 2),
  };
  return withCodeRetry(() =>
    ctx.db.$transaction(async (tx) => {
      const code = await nextCode(tx, "proficiencyTest", "EA");
      const pt = await tx.proficiencyTest.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          ...data,
          equipmentId: input.equipmentId || null,
          reportedValue: hasValues ? input.reportedValue! : null,
          assignedValue: hasValues ? input.assignedValue! : null,
          sigma: hasValues ? input.sigma! : null,
          zScore: z,
          outcome,
          reportDate,
          comments: input.comments?.trim() || null,
          recordedById: ctx.actor.id,
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "proficiency.record",
          entityType: "ProficiencyTest",
          entityId: pt.id,
          after: { code, ...data, zScore: z, outcome },
        },
        tx,
      );
      return pt;
    }),
  );
}

export function listProficiency(db: TenantDb) {
  return db.proficiencyTest.findMany({
    include: { equipment: { select: { id: true, code: true } } },
    orderBy: { reportDate: "desc" },
    take: 300,
  });
}

/** Ensayo con las CAPA que lo referencian (origen ENSAYO DE APTITUD y referencia = código). */
export async function getProficiency(db: TenantDb, id: string) {
  const pt = await db.proficiencyTest.findUnique({
    where: { id },
    include: { equipment: { select: { id: true, code: true, name: true } } },
  });
  if (!pt) return null;
  const capas = await db.capa.findMany({
    where: { source: "PROFICIENCY", sourceReference: pt.code },
    select: { id: true, code: true, title: true, status: true },
  });
  return { ...pt, capas };
}
