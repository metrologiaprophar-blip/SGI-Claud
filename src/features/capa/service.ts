import type { CapaSource, CapaStatus, CapaType, Prisma } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import { hasPermission, requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import type { TenantDb } from "@/server/db/tenant-client";
import { addAction, type ActionInput } from "../quality/actions-service";
import {
  nextCode,
  parseDay,
  requireActiveUser,
  requireText,
  SIGNATURE_ENTITY,
  withCodeRetry,
} from "../quality/shared";

const ENTITY = SIGNATURE_ENTITY.capa;

// ───────────────────────────── Consultas ─────────────────────────────

export type CapaFilter = { status?: CapaStatus; q?: string; mineUserId?: string; open?: boolean };

export function listCapas(db: TenantDb, filter: CapaFilter = {}) {
  const q = filter.q?.trim();
  return db.capa.findMany({
    where: {
      ...(filter.status
        ? { status: filter.status }
        : filter.open
          ? { status: { in: ["OPEN", "IN_PROGRESS", "EFFECTIVENESS_CHECK"] } }
          : {}),
      ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { title: { contains: q } }] } : {}),
      ...(filter.mineUserId
        ? {
            OR: [
              { ownerId: filter.mineUserId },
              { actions: { some: { responsibleId: filter.mineUserId } } },
            ],
          }
        : {}),
    },
    include: {
      owner: { select: { fullName: true } },
      deviation: { select: { id: true, code: true } },
      actions: { select: { status: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

export async function getCapa(db: TenantDb, id: string) {
  const capa = await db.capa.findUnique({
    where: { id },
    include: {
      owner: { select: { id: true, fullName: true } },
      deviation: { select: { id: true, code: true, title: true, investigatorId: true } },
      actions: {
        include: { responsible: { select: { id: true, fullName: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!capa) return null;
  const signatures = await db.electronicSignature.findMany({
    where: { entityType: ENTITY, entityId: id },
    orderBy: { signedAt: "asc" },
  });
  return { ...capa, signatures };
}

async function load(ctx: ServiceContext, id: string) {
  const capa = await ctx.db.capa.findUnique({ where: { id }, include: { actions: true } });
  if (!capa) throw new ServiceError("not_found");
  return capa;
}

// ───────────────────────────── Alta y plan ─────────────────────────────

export type CreateCapaInput = {
  title: string;
  source: CapaSource;
  deviationId?: string | null;
  sourceReference?: string | null;
  problemStatement: string;
  rootCause?: string | null;
  type: CapaType;
  ownerId: string;
  effectivenessCriteria: string;
  targetDate: string;
};

/**
 * Alta de una CAPA. La crea QA o, si nace de una desviación en investigación, su investigador.
 * El origen DESVIACIÓN exige vincular la desviación (de la misma empresa).
 */
export async function createCapa(ctx: ServiceContext, input: CreateCapaInput) {
  const qa = await hasPermission(ctx, "QA_APPROVE");
  let deviationId: string | null = null;
  if (input.source === "DEVIATION") {
    if (!input.deviationId) throw new ServiceError("deviation_required");
    const dev = await ctx.db.deviation.findUnique({ where: { id: input.deviationId } });
    if (!dev) throw new ServiceError("not_found");
    if (!["UNDER_INVESTIGATION", "PENDING_QA"].includes(dev.status))
      throw new ServiceError("invalid_state");
    if (!qa && dev.investigatorId !== ctx.actor.id) throw new ServiceError("forbidden");
    deviationId = dev.id;
  } else if (!qa) {
    throw new ServiceError("forbidden");
  }
  await requireActiveUser(ctx.db, input.ownerId);
  const targetDate = await parseDay(ctx, input.targetDate, { notPast: true });
  const data = {
    title: requireText(input.title),
    problemStatement: requireText(input.problemStatement, "required_fields", 10),
    effectivenessCriteria: requireText(input.effectivenessCriteria, "required_fields", 5),
  };
  return withCodeRetry(() =>
    ctx.db.$transaction(async (tx) => {
      const code = await nextCode(tx, "capa", "CAPA");
      const capa = await tx.capa.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          ...data,
          source: input.source,
          deviationId,
          sourceReference: input.sourceReference?.trim() || null,
          rootCause: input.rootCause?.trim() || null,
          type: input.type,
          ownerId: input.ownerId,
          targetDate,
          createdById: ctx.actor.id,
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "capa.create",
          entityType: ENTITY,
          entityId: capa.id,
          after: {
            code,
            title: data.title,
            source: input.source,
            deviationId,
            ownerId: input.ownerId,
            targetDate,
          },
        },
        tx,
      );
      return capa;
    }),
  );
}

export const addCapaAction = (ctx: ServiceContext, capaId: string, input: ActionInput) =>
  addAction(ctx, { capaId }, input);

export type DecisionInput = { decision: "approve" | "reject"; comment?: string; password: string };

/** QA aprueba el plan (APROBÓ) → en curso. Requiere al menos una acción y no puede ser el responsable. */
export async function approveCapaPlan(ctx: ServiceContext, id: string, input: DecisionInput) {
  await requirePermission(ctx, "QA_APPROVE");
  const capa = await load(ctx, id);
  if (capa.status !== "OPEN") throw new ServiceError("invalid_state");
  if (capa.ownerId === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const reject = input.decision === "reject";
  if (!reject && !capa.actions.some((a) => a.status === "PENDING"))
    throw new ServiceError("actions_required");
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
    const data: Prisma.CapaUncheckedUpdateInput = reject
      ? { returnComment: comment }
      : { status: "IN_PROGRESS", returnComment: null };
    const updated = await tx.capa.update({ where: { id }, data });
    await recordSignature(ctx, tx, signer, { meaning, entityType: ENTITY, entityId: id, comment });
    await logAudit(
      {
        ...auditBase(ctx),
        action: reject ? "capa.plan_return" : "capa.plan_approve",
        entityType: ENTITY,
        entityId: id,
        before: { status: "OPEN" },
        after: { status: updated.status },
        reason: comment ?? undefined,
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── Eficacia y cierre ─────────────────────────────

/** El responsable solicita la verificación de eficacia cuando todas las acciones están cerradas. */
export async function requestEffectivenessCheck(
  ctx: ServiceContext,
  id: string,
  effectivenessDueDate?: string,
) {
  const capa = await load(ctx, id);
  if (capa.ownerId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (capa.status !== "IN_PROGRESS") throw new ServiceError("invalid_state");
  if (
    capa.actions.some((a) => a.status === "PENDING") ||
    !capa.actions.some((a) => a.status === "DONE")
  )
    throw new ServiceError("actions_pending");
  const due = effectivenessDueDate
    ? await parseDay(ctx, effectivenessDueDate, { notPast: true })
    : null;
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.capa.update({
      where: { id },
      data: { status: "EFFECTIVENESS_CHECK", effectivenessDueDate: due },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "capa.effectiveness_request",
        entityType: ENTITY,
        entityId: id,
        before: { status: "IN_PROGRESS" },
        after: { status: "EFFECTIVENESS_CHECK", effectivenessDueDate: due },
      },
      tx,
    );
    return updated;
  });
}

export type VerifyInput = {
  decision: "effective" | "not_effective";
  result: string;
  password: string;
};

/** QA verifica la eficacia (VERIFICÓ) y cierra, o la devuelve a ejecución con nuevas acciones (RECHAZÓ). */
export async function verifyEffectiveness(ctx: ServiceContext, id: string, input: VerifyInput) {
  await requirePermission(ctx, "QA_APPROVE");
  const capa = await load(ctx, id);
  if (capa.status !== "EFFECTIVENESS_CHECK") throw new ServiceError("invalid_state");
  if (capa.ownerId === ctx.actor.id) throw new ServiceError("segregation_of_duties");
  const result = requireText(input.result, "effectiveness_result_required", 10);
  const effective = input.decision === "effective";
  const meaning = effective ? "VERIFIED" : "REJECTED";
  const signer = await verifySigner(ctx, input.password, {
    meaning,
    entityType: ENTITY,
    entityId: id,
  });
  return ctx.db.$transaction(async (tx) => {
    const fresh = await tx.capa.findUnique({ where: { id } });
    if (fresh?.status !== "EFFECTIVENESS_CHECK") throw new ServiceError("invalid_state");
    const data: Prisma.CapaUncheckedUpdateInput = effective
      ? {
          status: "CLOSED",
          effectivenessResult: result,
          verifiedById: ctx.actor.id,
          closedAt: new Date(),
        }
      : { status: "IN_PROGRESS", effectivenessResult: result, returnComment: result };
    const updated = await tx.capa.update({ where: { id }, data });
    await recordSignature(ctx, tx, signer, {
      meaning,
      entityType: ENTITY,
      entityId: id,
      comment: result,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: effective ? "capa.close" : "capa.not_effective",
        entityType: ENTITY,
        entityId: id,
        before: { status: "EFFECTIVENESS_CHECK" },
        after: { status: updated.status, effectivenessResult: result },
      },
      tx,
    );
    return updated;
  });
}

/** QA anula una CAPA que no procede (queda registrada con su motivo). */
export async function cancelCapa(ctx: ServiceContext, id: string, reason: string) {
  await requirePermission(ctx, "QA_APPROVE");
  const capa = await load(ctx, id);
  if (!["OPEN", "IN_PROGRESS"].includes(capa.status)) throw new ServiceError("invalid_state");
  const text = requireText(reason, "reason_required", 5);
  return ctx.db.$transaction(async (tx) => {
    await tx.qualityAction.updateMany({
      where: { capaId: id, status: "PENDING" },
      data: {
        status: "CANCELLED",
        evidence: text,
        completedAt: new Date(),
        completedById: ctx.actor.id,
      },
    });
    const updated = await tx.capa.update({
      where: { id },
      data: { status: "CANCELLED", cancelReason: text },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "capa.cancel",
        entityType: ENTITY,
        entityId: id,
        before: { status: capa.status },
        after: { status: "CANCELLED" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}
