import type {
  Classification,
  DeviationCategory,
  DeviationStatus,
  Prisma,
  RootCauseMethod,
} from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { addDays } from "@/lib/dates";
import { auditBase, type ServiceContext } from "@/server/context";
import { diff, logAudit } from "@/server/audit";
import { requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import type { TenantDb } from "@/server/db/tenant-client";
import {
  nextCode,
  parseDay,
  requireActiveUser,
  requireText,
  SIGNATURE_ENTITY,
  withCodeRetry,
} from "../quality/shared";

const ENTITY = SIGNATURE_ENTITY.deviation;
/** Plazo de investigación por defecto según la clasificación (días). */
export const DEFAULT_DUE_DAYS: Record<Classification, number> = {
  CRITICAL: 15,
  MAJOR: 30,
  MINOR: 30,
};

// ───────────────────────────── Consultas ─────────────────────────────

export type DeviationFilter = {
  status?: DeviationStatus;
  q?: string;
  mineUserId?: string;
  open?: boolean;
};

export function listDeviations(db: TenantDb, filter: DeviationFilter = {}) {
  const q = filter.q?.trim();
  const where: Prisma.DeviationWhereInput = {
    ...(filter.status
      ? { status: filter.status }
      : filter.open
        ? { status: { in: ["REPORTED", "UNDER_INVESTIGATION", "PENDING_QA"] } }
        : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q.toUpperCase() } },
            { title: { contains: q } },
            { batches: { contains: q } },
          ],
        }
      : {}),
    ...(filter.mineUserId
      ? { OR: [{ reportedById: filter.mineUserId }, { investigatorId: filter.mineUserId }] }
      : {}),
  };
  return db.deviation.findMany({
    where,
    include: {
      process: { select: { code: true, name: true } },
      reportedBy: { select: { fullName: true } },
      investigator: { select: { fullName: true } },
      _count: { select: { capas: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function getDeviation(db: TenantDb, id: string) {
  const deviation = await db.deviation.findUnique({
    where: { id },
    include: {
      process: true,
      reportedBy: { select: { id: true, fullName: true } },
      investigator: { select: { id: true, fullName: true } },
      capas: {
        select: { id: true, code: true, title: true, status: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!deviation) return null;
  const signatures = await db.electronicSignature.findMany({
    where: { entityType: ENTITY, entityId: id },
    orderBy: { signedAt: "asc" },
  });
  return { ...deviation, signatures };
}

async function load(ctx: ServiceContext, id: string) {
  const d = await ctx.db.deviation.findUnique({
    where: { id },
    include: { capas: { select: { status: true } } },
  });
  if (!d) throw new ServiceError("not_found");
  return d;
}

// ───────────────────────────── 1. Detección ─────────────────────────────

export type ReportInput = {
  title: string;
  description: string;
  category: DeviationCategory;
  processId: string;
  location?: string | null;
  detectedAt: string;
  batches?: string | null;
  immediateAction: string;
};

/** Cualquier persona registra la desviación al detectarla, con la acción inmediata (contención). */
export async function reportDeviation(ctx: ServiceContext, input: ReportInput) {
  if (!(await ctx.db.process.findUnique({ where: { id: input.processId } })))
    throw new ServiceError("not_found");
  const detectedAt = await parseDay(ctx, input.detectedAt, { notFuture: true });
  const data = {
    title: requireText(input.title),
    description: requireText(input.description, "required_fields", 10),
    immediateAction: requireText(input.immediateAction),
  };
  return withCodeRetry(() =>
    ctx.db.$transaction(async (tx) => {
      const code = await nextCode(tx, "deviation", "DEV");
      const deviation = await tx.deviation.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          ...data,
          category: input.category,
          processId: input.processId,
          location: input.location?.trim() || null,
          batches: input.batches?.trim() || null,
          detectedAt,
          reportedById: ctx.actor.id,
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "deviation.report",
          entityType: ENTITY,
          entityId: deviation.id,
          after: { code, title: data.title, category: input.category, batches: deviation.batches },
        },
        tx,
      );
      return deviation;
    }),
  );
}

// ───────────────────────────── 2. Clasificación (QA) ─────────────────────────────

export type TriageInput = {
  classification: Classification;
  investigatorId: string;
  dueDate?: string;
  capaRequired: boolean;
  comment?: string;
};

/** Garantía de Calidad clasifica, asigna investigador y plazo. */
export async function triageDeviation(ctx: ServiceContext, id: string, input: TriageInput) {
  await requirePermission(ctx, "QA_APPROVE");
  const d = await load(ctx, id);
  if (d.status !== "REPORTED") throw new ServiceError("invalid_state");
  await requireActiveUser(ctx.db, input.investigatorId);
  const dueDate = input.dueDate
    ? await parseDay(ctx, input.dueDate, { notPast: true })
    : addDays(new Date(), DEFAULT_DUE_DAYS[input.classification]);
  const next = {
    status: "UNDER_INVESTIGATION" as const,
    classification: input.classification,
    investigatorId: input.investigatorId,
    dueDate,
    capaRequired: input.capaRequired || input.classification === "CRITICAL",
    triageComment: input.comment?.trim() || null,
  };
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.deviation.update({ where: { id }, data: next });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "deviation.triage",
        entityType: ENTITY,
        entityId: id,
        before: { status: d.status },
        after: next,
        reason: next.triageComment ?? undefined,
      },
      tx,
    );
    return updated;
  });
}

/** QA descarta un reporte que no es una desviación (queda anulado con su motivo). */
export async function dismissDeviation(ctx: ServiceContext, id: string, reason: string) {
  await requirePermission(ctx, "QA_APPROVE");
  const d = await load(ctx, id);
  if (d.status !== "REPORTED") throw new ServiceError("invalid_state");
  const text = requireText(reason, "reason_required", 5);
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.deviation.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: text },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "deviation.dismiss",
        entityType: ENTITY,
        entityId: id,
        before: { status: d.status },
        after: { status: "CANCELLED" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── 3. Investigación ─────────────────────────────

export type InvestigationInput = {
  rootCauseMethod?: RootCauseMethod | null;
  rootCause?: string | null;
  impactAssessment?: string | null;
  productDisposition?: string | null;
  conclusion?: string | null;
};

/** El investigador guarda su avance (cada cambio queda auditado con antes/después). */
export async function saveInvestigation(
  ctx: ServiceContext,
  id: string,
  input: InvestigationInput,
) {
  const d = await load(ctx, id);
  if (d.investigatorId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (d.status !== "UNDER_INVESTIGATION") throw new ServiceError("invalid_state");
  const next = {
    rootCauseMethod: input.rootCauseMethod ?? null,
    rootCause: input.rootCause?.trim() || null,
    impactAssessment: input.impactAssessment?.trim() || null,
    productDisposition: input.productDisposition?.trim() || null,
    conclusion: input.conclusion?.trim() || null,
  };
  const changes = diff(d, next);
  if (!changes.changed) return d;
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.deviation.update({ where: { id }, data: next });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "deviation.investigation.save",
        entityType: ENTITY,
        entityId: id,
        before: changes.before,
        after: changes.after,
      },
      tx,
    );
    return updated;
  });
}

/** El investigador firma (ELABORÓ) y envía a QA. Si se exige CAPA, debe haber al menos una vinculada. */
export async function submitInvestigation(ctx: ServiceContext, id: string, password: string) {
  const d = await load(ctx, id);
  if (d.investigatorId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (d.status !== "UNDER_INVESTIGATION") throw new ServiceError("invalid_state");
  if (!d.rootCauseMethod || !d.rootCause || !d.impactAssessment || !d.conclusion)
    throw new ServiceError("investigation_incomplete");
  if (d.capaRequired && !d.capas.some((c) => c.status !== "CANCELLED"))
    throw new ServiceError("capa_required");
  const signer = await verifySigner(ctx, password, {
    meaning: "AUTHORED",
    entityType: ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.deviation.update({
      where: { id },
      data: { status: "PENDING_QA", returnComment: null },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "AUTHORED",
      entityType: ENTITY,
      entityId: id,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "deviation.investigation.submit",
        entityType: ENTITY,
        entityId: id,
        before: { status: d.status },
        after: { status: "PENDING_QA" },
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── 4. Cierre (QA) ─────────────────────────────

export type CloseInput = { decision: "approve" | "reject"; comment?: string; password: string };

/** QA aprueba el cierre (APROBÓ) o devuelve la investigación (RECHAZÓ). No puede ser el investigador. */
export async function closeDeviation(ctx: ServiceContext, id: string, input: CloseInput) {
  await requirePermission(ctx, "QA_APPROVE");
  const d = await load(ctx, id);
  if (d.status !== "PENDING_QA") throw new ServiceError("invalid_state");
  if (d.investigatorId === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const reject = input.decision === "reject";
  const comment = reject
    ? requireText(input.comment, "reason_required", 5)
    : input.comment?.trim() || null;
  const meaning = reject ? "REJECTED" : "APPROVED";
  const signer = await verifySigner(ctx, input.password, {
    meaning,
    entityType: ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const fresh = await tx.deviation.findUnique({ where: { id } });
    if (fresh?.status !== "PENDING_QA") throw new ServiceError("invalid_state");
    const data: Prisma.DeviationUncheckedUpdateInput = reject
      ? { status: "UNDER_INVESTIGATION", returnComment: comment }
      : { status: "CLOSED", closedAt: new Date(), closedById: ctx.actor.id };
    const updated = await tx.deviation.update({ where: { id }, data });
    await recordSignature(ctx, tx, signer, { meaning, entityType: ENTITY, entityId: id, comment });
    await logAudit(
      {
        ...auditBase(ctx),
        action: reject ? "deviation.return" : "deviation.close",
        entityType: ENTITY,
        entityId: id,
        before: { status: "PENDING_QA" },
        after: { status: updated.status },
        reason: comment ?? undefined,
      },
      tx,
    );
    return updated;
  });
}
