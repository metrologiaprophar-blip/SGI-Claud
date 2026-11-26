import type { ChangeStatus, ChangeType, Classification, Prisma, RiskLevel } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { diff, logAudit } from "@/server/audit";
import { hasPermission, requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import type { TenantDb } from "@/server/db/tenant-client";
import { addAction, type ActionInput } from "../quality/actions-service";
import {
  nextCode,
  parseDay,
  requireText,
  SIGNATURE_ENTITY,
  withCodeRetry,
} from "../quality/shared";

const ENTITY = SIGNATURE_ENTITY.change;

// ───────────────────────────── Consultas ─────────────────────────────

export type ChangeFilter = {
  status?: ChangeStatus;
  q?: string;
  mineUserId?: string;
  open?: boolean;
};

export function listChanges(db: TenantDb, filter: ChangeFilter = {}) {
  const q = filter.q?.trim();
  return db.changeControl.findMany({
    where: {
      ...(filter.status
        ? { status: filter.status }
        : filter.open
          ? { status: { in: ["DRAFT", "IN_ASSESSMENT", "APPROVED", "IMPLEMENTED"] } }
          : {}),
      ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { title: { contains: q } }] } : {}),
      ...(filter.mineUserId
        ? {
            OR: [
              { requesterId: filter.mineUserId },
              { actions: { some: { responsibleId: filter.mineUserId } } },
            ],
          }
        : {}),
    },
    include: {
      requester: { select: { fullName: true } },
      process: { select: { code: true } },
      actions: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function getChange(db: TenantDb, id: string) {
  const change = await db.changeControl.findUnique({
    where: { id },
    include: {
      process: true,
      requester: { select: { id: true, fullName: true } },
      actions: {
        include: { responsible: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!change) return null;
  const signatures = await db.electronicSignature.findMany({
    where: { entityType: ENTITY, entityId: id },
    orderBy: { signedAt: "asc" },
  });
  return { ...change, signatures };
}

async function load(ctx: ServiceContext, id: string) {
  const change = await ctx.db.changeControl.findUnique({
    where: { id },
    include: { actions: true },
  });
  if (!change) throw new ServiceError("not_found");
  return change;
}

// ───────────────────────────── Propuesta ─────────────────────────────

export type ChangeInput = {
  title: string;
  description: string;
  justification: string;
  changeType: ChangeType;
  processId: string;
  affectedItems?: string | null;
  plannedDate?: string | null;
};

async function normalize(ctx: ServiceContext, input: ChangeInput) {
  if (!(await ctx.db.process.findUnique({ where: { id: input.processId } })))
    throw new ServiceError("not_found");
  return {
    title: requireText(input.title),
    description: requireText(input.description, "required_fields", 10),
    justification: requireText(input.justification, "required_fields", 10),
    changeType: input.changeType,
    processId: input.processId,
    affectedItems: input.affectedItems?.trim() || null,
    plannedDate: input.plannedDate
      ? await parseDay(ctx, input.plannedDate, { notPast: true })
      : null,
  };
}

/** Cualquier persona propone un cambio (queda en borrador hasta que lo firma y envía). */
export async function createChange(ctx: ServiceContext, input: ChangeInput) {
  const data = await normalize(ctx, input);
  return withCodeRetry(() =>
    ctx.db.$transaction(async (tx) => {
      const code = await nextCode(tx, "changeControl", "CC");
      const change = await tx.changeControl.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          ...data,
          requesterId: ctx.actor.id,
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "change.create",
          entityType: ENTITY,
          entityId: change.id,
          after: { code, ...data },
        },
        tx,
      );
      return change;
    }),
  );
}

export async function updateChangeDraft(ctx: ServiceContext, id: string, input: ChangeInput) {
  const change = await load(ctx, id);
  if (change.requesterId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (change.status !== "DRAFT") throw new ServiceError("invalid_state");
  const next = await normalize(ctx, input);
  const changes = diff(change, next);
  if (!changes.changed) return change;
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.changeControl.update({ where: { id }, data: next });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "change.update",
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

/** El solicitante firma (ELABORÓ) y envía a evaluación de Garantía de Calidad. */
export async function submitChange(ctx: ServiceContext, id: string, password: string) {
  const change = await load(ctx, id);
  if (change.requesterId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (change.status !== "DRAFT") throw new ServiceError("invalid_state");
  const signer = await verifySigner(ctx, password, {
    meaning: "AUTHORED",
    entityType: ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.changeControl.update({
      where: { id },
      data: { status: "IN_ASSESSMENT" },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "AUTHORED",
      entityType: ENTITY,
      entityId: id,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "change.submit",
        entityType: ENTITY,
        entityId: id,
        before: { status: "DRAFT" },
        after: { status: "IN_ASSESSMENT" },
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── Evaluación (QA) ─────────────────────────────

export type AssessmentInput = {
  classification: Classification;
  riskLevel: RiskLevel;
  regulatoryNotification: boolean;
  impactQuality: string;
  impactValidation?: string | null;
  impactDocuments?: string | null;
  impactTraining?: string | null;
};

/** QA registra la evaluación de impacto y riesgo (editable mientras el cambio está en evaluación). */
export async function saveAssessment(ctx: ServiceContext, id: string, input: AssessmentInput) {
  await requirePermission(ctx, "QA_APPROVE");
  const change = await load(ctx, id);
  if (change.status !== "IN_ASSESSMENT") throw new ServiceError("invalid_state");
  if (change.requesterId === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const next = {
    classification: input.classification,
    riskLevel: input.riskLevel,
    regulatoryNotification: input.regulatoryNotification,
    impactQuality: requireText(input.impactQuality, "required_fields", 5),
    impactValidation: input.impactValidation?.trim() || null,
    impactDocuments: input.impactDocuments?.trim() || null,
    impactTraining: input.impactTraining?.trim() || null,
  };
  const changes = diff(change, next);
  if (!changes.changed) return change;
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.changeControl.update({ where: { id }, data: next });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "change.assessment.save",
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

export const addChangeAction = (ctx: ServiceContext, changeId: string, input: ActionInput) =>
  addAction(ctx, { changeControlId: changeId }, input);

export type ChangeDecision = {
  decision: "approve" | "return" | "reject";
  comment?: string;
  password: string;
};

/**
 * QA decide: APROBÓ (requiere evaluación y al menos una acción de implementación), devolver al
 * solicitante para completar, o RECHAZAR definitivamente. Nunca el propio solicitante.
 */
export async function decideChange(ctx: ServiceContext, id: string, input: ChangeDecision) {
  await requirePermission(ctx, "QA_APPROVE");
  const change = await load(ctx, id);
  if (change.status !== "IN_ASSESSMENT") throw new ServiceError("invalid_state");
  if (change.requesterId === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const approve = input.decision === "approve";
  if (
    approve &&
    (!change.classification ||
      !change.riskLevel ||
      change.regulatoryNotification === null ||
      !change.impactQuality)
  ) {
    throw new ServiceError("assessment_incomplete");
  }
  if (approve && !change.actions.some((a) => a.status === "PENDING"))
    throw new ServiceError("actions_required");
  const comment = approve
    ? input.comment?.trim() || null
    : requireText(input.comment, "reason_required", 5);
  const meaning = approve ? "APPROVED" : "REJECTED";
  const signer = await verifySigner(ctx, input.password, {
    meaning,
    entityType: ENTITY,
    entityId: id,
  });
  const status: ChangeStatus = approve
    ? "APPROVED"
    : input.decision === "return"
      ? "DRAFT"
      : "REJECTED";
  return ctx.db.$transaction(async (tx) => {
    const data: Prisma.ChangeControlUncheckedUpdateInput = {
      status,
      assessmentComment: comment,
      ...(approve ? { approvedById: ctx.actor.id, approvedAt: new Date() } : {}),
    };
    if (status === "REJECTED") {
      await tx.qualityAction.updateMany({
        where: { changeControlId: id, status: "PENDING" },
        data: {
          status: "CANCELLED",
          evidence: comment,
          completedAt: new Date(),
          completedById: ctx.actor.id,
        },
      });
    }
    const updated = await tx.changeControl.update({ where: { id }, data });
    await recordSignature(ctx, tx, signer, { meaning, entityType: ENTITY, entityId: id, comment });
    await logAudit(
      {
        ...auditBase(ctx),
        action: `change.${input.decision}`,
        entityType: ENTITY,
        entityId: id,
        before: { status: "IN_ASSESSMENT" },
        after: { status },
        reason: comment ?? undefined,
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── Implementación y cierre ─────────────────────────────

/** El solicitante (o QA) declara el cambio implementado cuando todas sus acciones están cerradas. */
export async function markImplemented(ctx: ServiceContext, id: string) {
  const change = await load(ctx, id);
  if (change.requesterId !== ctx.actor.id && !(await hasPermission(ctx, "QA_APPROVE")))
    throw new ServiceError("forbidden");
  if (change.status !== "APPROVED") throw new ServiceError("invalid_state");
  if (change.actions.some((a) => a.status === "PENDING")) throw new ServiceError("actions_pending");
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.changeControl.update({
      where: { id },
      data: { status: "IMPLEMENTED", implementedAt: new Date() },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "change.implemented",
        entityType: ENTITY,
        entityId: id,
        before: { status: "APPROVED" },
        after: { status: "IMPLEMENTED" },
      },
      tx,
    );
    return updated;
  });
}

/** QA verifica la implementación y su eficacia (VERIFICÓ) y cierra el cambio. */
export async function closeChange(
  ctx: ServiceContext,
  id: string,
  comment: string,
  password: string,
) {
  await requirePermission(ctx, "QA_APPROVE");
  const change = await load(ctx, id);
  if (change.status !== "IMPLEMENTED") throw new ServiceError("invalid_state");
  if (change.requesterId === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const text = requireText(comment, "effectiveness_result_required", 10);
  const signer = await verifySigner(ctx, password, {
    meaning: "VERIFIED",
    entityType: ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.changeControl.update({
      where: { id },
      data: { status: "CLOSED", closureComment: text, closedAt: new Date() },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "VERIFIED",
      entityType: ENTITY,
      entityId: id,
      comment: text,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "change.close",
        entityType: ENTITY,
        entityId: id,
        before: { status: "IMPLEMENTED" },
        after: { status: "CLOSED" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}

/** Anulación: el solicitante en borrador, o QA hasta antes de implementarse. */
export async function cancelChange(ctx: ServiceContext, id: string, reason: string) {
  const change = await load(ctx, id);
  const qa = await hasPermission(ctx, "QA_APPROVE");
  const allowed =
    (change.status === "DRAFT" && (change.requesterId === ctx.actor.id || qa)) ||
    (qa && ["IN_ASSESSMENT", "APPROVED"].includes(change.status));
  if (!allowed)
    throw new ServiceError(
      ["IMPLEMENTED", "CLOSED", "REJECTED", "CANCELLED"].includes(change.status)
        ? "invalid_state"
        : "forbidden",
    );
  const text = requireText(reason, "reason_required", 5);
  return ctx.db.$transaction(async (tx) => {
    await tx.qualityAction.updateMany({
      where: { changeControlId: id, status: "PENDING" },
      data: {
        status: "CANCELLED",
        evidence: text,
        completedAt: new Date(),
        completedById: ctx.actor.id,
      },
    });
    const updated = await tx.changeControl.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: text },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "change.cancel",
        entityType: ENTITY,
        entityId: id,
        before: { status: change.status },
        after: { status: "CANCELLED" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}
