import { Prisma, type EquipmentStatus, type RiskLevel } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { addDays } from "@/lib/dates";
import { auditBase, type ServiceContext } from "@/server/context";
import { diff, logAudit } from "@/server/audit";
import { requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import type { TenantDb } from "@/server/db/tenant-client";
import { requireActiveUser, requireText, type Tx } from "../quality/shared";

export const EQUIPMENT_ENTITY = "Equipment";
export const EQUIPMENT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;

// ───────────────────────────── Consultas ─────────────────────────────

export type EquipmentFilter = {
  q?: string;
  status?: EquipmentStatus;
  referenceOnly?: boolean;
  due?: "overdue" | "soon";
  includeRetired?: boolean;
};

export function listEquipment(db: TenantDb, filter: EquipmentFilter = {}) {
  const q = filter.q?.trim();
  const now = new Date();
  return db.equipment.findMany({
    where: {
      ...(filter.status
        ? { status: filter.status }
        : filter.includeRetired
          ? {}
          : { status: { not: "RETIRED" } }),
      ...(filter.referenceOnly ? { isReferenceStandard: true } : {}),
      ...(filter.due === "overdue" ? { nextCalibrationDue: { lt: now } } : {}),
      ...(filter.due === "soon" ? { nextCalibrationDue: { gte: now, lte: addDays(now, 30) } } : {}),
      ...(q
        ? {
            OR: [
              { code: { contains: q.toUpperCase() } },
              { name: { contains: q } },
              { serialNumber: { contains: q } },
              { location: { contains: q } },
            ],
          }
        : {}),
    },
    include: { process: { select: { code: true } }, owner: { select: { fullName: true } } },
    orderBy: { code: "asc" },
  });
}

export async function getEquipment(db: TenantDb, id: string) {
  const equipment = await db.equipment.findUnique({
    where: { id },
    include: {
      process: true,
      owner: { select: { id: true, fullName: true } },
      calibrations: { orderBy: { calibratedAt: "desc" } },
      verifications: { orderBy: { performedAt: "desc" }, take: 50 },
      maintenances: { orderBy: { performedAt: "desc" } },
      qualifications: { orderBy: { executedAt: "desc" } },
      proficiency: { orderBy: { reportDate: "desc" } },
    },
  });
  if (!equipment) return null;
  const signatures = await db.electronicSignature.findMany({
    where: { entityType: EQUIPMENT_ENTITY, entityId: id },
    orderBy: { signedAt: "asc" },
  });
  return { ...equipment, signatures };
}

export async function loadEquipment(db: TenantDb | Tx, id: string) {
  const equipment = await db.equipment.findUnique({ where: { id } });
  if (!equipment) throw new ServiceError("not_found");
  return equipment;
}

// ───────────────────────────── Alta y edición ─────────────────────────────

export type EquipmentInput = {
  code: string;
  name: string;
  equipmentType: string;
  manufacturer?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  processId: string;
  ownerId: string;
  criticality: RiskLevel;
  isReferenceStandard: boolean;
  measurementRange?: string | null;
  resolution?: string | null;
  unit?: string | null;
  maxPermissibleError?: number | null;
  calibrationIntervalMonths?: number | null;
  verificationIntervalDays?: number | null;
  maintenanceIntervalMonths?: number | null;
};

const positiveOrNull = (v: number | null | undefined, max: number) => {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  if (v <= 0 || v > max) throw new ServiceError("out_of_range");
  return v;
};

async function normalize(ctx: ServiceContext, input: EquipmentInput) {
  if (!(await ctx.db.process.findUnique({ where: { id: input.processId } })))
    throw new ServiceError("not_found");
  await requireActiveUser(ctx.db, input.ownerId);
  const opt = (v?: string | null) => v?.trim() || null;
  return {
    name: requireText(input.name),
    equipmentType: requireText(input.equipmentType, "required_fields", 2),
    manufacturer: opt(input.manufacturer),
    model: opt(input.model),
    serialNumber: opt(input.serialNumber),
    location: opt(input.location),
    processId: input.processId,
    ownerId: input.ownerId,
    criticality: input.criticality,
    isReferenceStandard: input.isReferenceStandard,
    measurementRange: opt(input.measurementRange),
    resolution: opt(input.resolution),
    unit: opt(input.unit),
    maxPermissibleError: positiveOrNull(input.maxPermissibleError, 1e9),
    calibrationIntervalMonths: positiveOrNull(input.calibrationIntervalMonths, 120),
    verificationIntervalDays: positiveOrNull(input.verificationIntervalDays, 3650),
    maintenanceIntervalMonths: positiveOrNull(input.maintenanceIntervalMonths, 120),
  };
}

/** Alta de un equipo (control metrológico, permiso METROLOGY_MANAGE). */
export async function createEquipment(ctx: ServiceContext, input: EquipmentInput) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const code = input.code.trim().toUpperCase();
  if (!EQUIPMENT_CODE_PATTERN.test(code)) throw new ServiceError("invalid_equipment_code");
  const data = await normalize(ctx, input);
  try {
    return await ctx.db.$transaction(async (tx) => {
      const equipment = await tx.equipment.create({
        data: { organizationId: ctx.actor.organizationId, code, ...data },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "equipment.create",
          entityType: EQUIPMENT_ENTITY,
          entityId: equipment.id,
          after: { code, ...data },
        },
        tx,
      );
      return equipment;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ServiceError("equipment_code_taken");
    throw e;
  }
}

/** Edición de datos del equipo con motivo (queda el antes/después en la auditoría). */
export async function updateEquipment(
  ctx: ServiceContext,
  id: string,
  input: Omit<EquipmentInput, "code">,
  reason: string,
) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const current = await loadEquipment(ctx.db, id);
  const text = requireText(reason, "reason_required", 3);
  const next = await normalize(ctx, { ...input, code: current.code });
  const changes = diff(current, next);
  if (!changes.changed) return current;
  // Un cambio del intervalo de calibración recalcula el próximo vencimiento desde la última calibración.
  const extra =
    next.calibrationIntervalMonths !== current.calibrationIntervalMonths &&
    current.lastCalibrationAt
      ? {
          nextCalibrationDue: next.calibrationIntervalMonths
            ? addMonthsUtc(current.lastCalibrationAt, next.calibrationIntervalMonths)
            : null,
        }
      : {};
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.equipment.update({ where: { id }, data: { ...next, ...extra } });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "equipment.update",
        entityType: EQUIPMENT_ENTITY,
        entityId: id,
        before: changes.before,
        after: { ...changes.after, ...extra },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}

function addMonthsUtc(date: Date, months: number) {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}
export { addMonthsUtc };

// ───────────────────────────── Estado ─────────────────────────────

/** Fuera de servicio (control metrológico o automático por un resultado no conforme). */
export async function setOutOfService(
  ctx: ServiceContext,
  tx: Tx,
  equipmentId: string,
  reason: string,
) {
  const current = await loadEquipment(tx, equipmentId);
  if (current.status === "RETIRED") return current;
  const updated = await tx.equipment.update({
    where: { id: equipmentId },
    data: { status: "OUT_OF_SERVICE", statusReason: reason },
  });
  await logAudit(
    {
      ...auditBase(ctx),
      action: "equipment.out_of_service",
      entityType: EQUIPMENT_ENTITY,
      entityId: equipmentId,
      before: { status: current.status },
      after: { status: "OUT_OF_SERVICE" },
      reason,
    },
    tx,
  );
  return updated;
}

export async function takeOutOfService(ctx: ServiceContext, id: string, reason: string) {
  await requirePermission(ctx, "METROLOGY_MANAGE");
  const current = await loadEquipment(ctx.db, id);
  if (current.status !== "IN_SERVICE") throw new ServiceError("invalid_state");
  const text = requireText(reason, "reason_required", 5);
  return ctx.db.$transaction((tx) => setOutOfService(ctx, tx, id, text));
}

/**
 * Puesta en servicio (APROBÓ, permiso METROLOGY_APPROVE). Se bloquea si la calibración está vencida:
 * primero hay que calibrar.
 */
export async function returnToService(
  ctx: ServiceContext,
  id: string,
  reason: string,
  password: string,
) {
  await requirePermission(ctx, "METROLOGY_APPROVE");
  const current = await loadEquipment(ctx.db, id);
  if (current.status !== "OUT_OF_SERVICE") throw new ServiceError("invalid_state");
  if (
    current.calibrationIntervalMonths &&
    (!current.nextCalibrationDue || current.nextCalibrationDue < new Date())
  )
    throw new ServiceError("calibration_overdue");
  const text = requireText(reason, "reason_required", 5);
  const signer = await verifySigner(ctx, password, {
    meaning: "APPROVED",
    entityType: EQUIPMENT_ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id },
      data: { status: "IN_SERVICE", statusReason: null },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "APPROVED",
      entityType: EQUIPMENT_ENTITY,
      entityId: id,
      comment: text,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "equipment.return_to_service",
        entityType: EQUIPMENT_ENTITY,
        entityId: id,
        before: { status: "OUT_OF_SERVICE" },
        after: { status: "IN_SERVICE" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}

/** Baja definitiva (OBSOLETO, permiso METROLOGY_APPROVE). El historial se conserva. */
export async function retireEquipment(
  ctx: ServiceContext,
  id: string,
  reason: string,
  password: string,
) {
  await requirePermission(ctx, "METROLOGY_APPROVE");
  const current = await loadEquipment(ctx.db, id);
  if (current.status === "RETIRED") throw new ServiceError("invalid_state");
  const text = requireText(reason, "reason_required", 5);
  const signer = await verifySigner(ctx, password, {
    meaning: "OBSOLETED",
    entityType: EQUIPMENT_ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.equipment.update({
      where: { id },
      data: { status: "RETIRED", statusReason: text },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "OBSOLETED",
      entityType: EQUIPMENT_ENTITY,
      entityId: id,
      comment: text,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "equipment.retire",
        entityType: EQUIPMENT_ENTITY,
        entityId: id,
        before: { status: current.status },
        after: { status: "RETIRED" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── Panel ─────────────────────────────

/** Indicadores del área: calibraciones vencidas y próximas, equipos fuera de servicio y pendientes de aprobar. */
export async function getMetrologyDashboard(db: TenantDb) {
  const now = new Date();
  const soon = addDays(now, 30);
  const active = { status: { not: "RETIRED" as const } };
  const pick = {
    id: true,
    code: true,
    name: true,
    nextCalibrationDue: true,
    nextVerificationDue: true,
    status: true,
    statusReason: true,
  } as const;
  const [
    overdue,
    dueSoon,
    outOfService,
    verificationsDue,
    pendingCalibrations,
    pendingQualifications,
    total,
  ] = await Promise.all([
    db.equipment.findMany({
      where: { ...active, nextCalibrationDue: { lt: now } },
      select: pick,
      orderBy: { nextCalibrationDue: "asc" },
    }),
    db.equipment.findMany({
      where: { ...active, nextCalibrationDue: { gte: now, lte: soon } },
      select: pick,
      orderBy: { nextCalibrationDue: "asc" },
    }),
    db.equipment.findMany({
      where: { status: "OUT_OF_SERVICE" },
      select: pick,
      orderBy: { code: "asc" },
    }),
    db.equipment.findMany({
      where: { status: "IN_SERVICE", nextVerificationDue: { lt: now } },
      select: pick,
      orderBy: { nextVerificationDue: "asc" },
    }),
    db.calibration.findMany({
      where: { status: "RECORDED" },
      select: {
        id: true,
        code: true,
        recordedById: true,
        equipment: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.qualification.findMany({
      where: { status: "RECORDED" },
      select: {
        id: true,
        code: true,
        recordedById: true,
        equipment: { select: { code: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    db.equipment.count({ where: active }),
  ]);
  return {
    overdue,
    dueSoon,
    outOfService,
    verificationsDue,
    pendingCalibrations,
    pendingQualifications,
    total,
  };
}
