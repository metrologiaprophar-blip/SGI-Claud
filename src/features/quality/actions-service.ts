import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import { hasPermission } from "@/server/permissions";
import { parseDay, requireActiveUser, requireText } from "./shared";

export type ActionInput = { description: string; responsibleId: string; dueDate: string };
export type ActionParent = { capaId: string } | { changeControlId: string };

/** Estados del registro padre en los que se pueden ejecutar acciones. */
const EXECUTABLE = { capa: "IN_PROGRESS", change: "APPROVED" } as const;

async function loadParent(ctx: ServiceContext, parent: ActionParent) {
  if ("capaId" in parent) {
    const capa = await ctx.db.capa.findUnique({ where: { id: parent.capaId } });
    if (!capa) throw new ServiceError("not_found");
    return {
      kind: "capa" as const,
      status: capa.status as string,
      ownerId: capa.ownerId,
      entityType: "Capa",
      id: capa.id,
    };
  }
  const change = await ctx.db.changeControl.findUnique({ where: { id: parent.changeControlId } });
  if (!change) throw new ServiceError("not_found");
  return {
    kind: "change" as const,
    status: change.status as string,
    ownerId: change.requesterId,
    entityType: "ChangeControl",
    id: change.id,
  };
}

/**
 * Añade una acción al plan. CAPA: el responsable de la CAPA o QA, mientras esté abierta o en curso.
 * Cambio: solo QA, durante la evaluación.
 */
export async function addAction(ctx: ServiceContext, parent: ActionParent, input: ActionInput) {
  const p = await loadParent(ctx, parent);
  const qa = await hasPermission(ctx, "QA_APPROVE");
  const allowed =
    p.kind === "capa"
      ? ["OPEN", "IN_PROGRESS"].includes(p.status) && (qa || p.ownerId === ctx.actor.id)
      : p.status === "IN_ASSESSMENT" && qa;
  if (!allowed)
    throw new ServiceError(
      p.kind === "capa" && !["OPEN", "IN_PROGRESS"].includes(p.status)
        ? "invalid_state"
        : "forbidden",
    );
  const description = requireText(input.description, "required_fields", 5);
  await requireActiveUser(ctx.db, input.responsibleId);
  const dueDate = await parseDay(ctx, input.dueDate, { notPast: true });
  return ctx.db.$transaction(async (tx) => {
    const action = await tx.qualityAction.create({
      data: {
        organizationId: ctx.actor.organizationId,
        ...parent,
        description,
        responsibleId: input.responsibleId,
        dueDate,
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "quality.action.create",
        entityType: p.entityType,
        entityId: p.id,
        after: { actionId: action.id, description, responsibleId: input.responsibleId, dueDate },
      },
      tx,
    );
    return action;
  });
}

/** El responsable registra la ejecución de su acción con la evidencia. */
export async function completeAction(ctx: ServiceContext, actionId: string, evidence: string) {
  const action = await ctx.db.qualityAction.findUnique({ where: { id: actionId } });
  if (!action) throw new ServiceError("not_found");
  if (action.responsibleId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (action.status !== "PENDING") throw new ServiceError("invalid_state");
  const p = await loadParent(
    ctx,
    action.capaId ? { capaId: action.capaId } : { changeControlId: action.changeControlId! },
  );
  if (p.status !== EXECUTABLE[p.kind]) throw new ServiceError("invalid_state");
  const text = requireText(evidence, "evidence_required", 5);
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.qualityAction.update({
      where: { id: actionId },
      data: {
        status: "DONE",
        evidence: text,
        completedAt: new Date(),
        completedById: ctx.actor.id,
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "quality.action.complete",
        entityType: p.entityType,
        entityId: p.id,
        before: { actionId, status: "PENDING" },
        after: { actionId, status: "DONE", evidence: text },
      },
      tx,
    );
    return updated;
  });
}

/** QA anula una acción que ya no aplica (queda registrada con su motivo). */
export async function cancelAction(ctx: ServiceContext, actionId: string, reason: string) {
  if (!(await hasPermission(ctx, "QA_APPROVE"))) throw new ServiceError("forbidden");
  const action = await ctx.db.qualityAction.findUnique({ where: { id: actionId } });
  if (!action) throw new ServiceError("not_found");
  if (action.status !== "PENDING") throw new ServiceError("invalid_state");
  const text = requireText(reason, "reason_required", 5);
  const p = await loadParent(
    ctx,
    action.capaId ? { capaId: action.capaId } : { changeControlId: action.changeControlId! },
  );
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.qualityAction.update({
      where: { id: actionId },
      data: {
        status: "CANCELLED",
        evidence: text,
        completedAt: new Date(),
        completedById: ctx.actor.id,
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "quality.action.cancel",
        entityType: p.entityType,
        entityId: p.id,
        before: { actionId, status: "PENDING" },
        after: { actionId, status: "CANCELLED" },
        reason: text,
      },
      tx,
    );
    return updated;
  });
}
