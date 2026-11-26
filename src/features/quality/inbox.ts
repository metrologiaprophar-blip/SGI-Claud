import type { ServiceContext } from "@/server/context";
import { hasPermission } from "@/server/permissions";

/** Pendientes de calidad del usuario: lo que le toca hacer en desviaciones, CAPA y cambios. */
export async function getQualityInbox(ctx: ServiceContext) {
  const me = ctx.actor.id;
  const qa = await hasPermission(ctx, "QA_APPROVE");
  const db = ctx.db;
  const dev = { id: true, code: true, title: true, status: true, dueDate: true } as const;
  const capa = { id: true, code: true, title: true, status: true, targetDate: true } as const;
  const change = { id: true, code: true, title: true, status: true, plannedDate: true } as const;
  const none = Promise.resolve([]);

  const [
    toTriage,
    toInvestigate,
    devToClose,
    capaToApprove,
    capaToVerify,
    myActions,
    changesToAssess,
    changesToClose,
    myDrafts,
    capaReady,
  ] = await Promise.all([
    qa
      ? db.deviation.findMany({
          where: { status: "REPORTED" },
          select: dev,
          orderBy: { createdAt: "asc" },
        })
      : none,
    db.deviation.findMany({
      where: { status: "UNDER_INVESTIGATION", investigatorId: me },
      select: dev,
      orderBy: { dueDate: "asc" },
    }),
    qa
      ? db.deviation.findMany({
          where: { status: "PENDING_QA", investigatorId: { not: me } },
          select: dev,
          orderBy: { updatedAt: "asc" },
        })
      : none,
    qa
      ? db.capa.findMany({
          where: { status: "OPEN", ownerId: { not: me } },
          select: capa,
          orderBy: { createdAt: "asc" },
        })
      : none,
    qa
      ? db.capa.findMany({
          where: { status: "EFFECTIVENESS_CHECK", ownerId: { not: me } },
          select: capa,
          orderBy: { updatedAt: "asc" },
        })
      : none,
    db.qualityAction.findMany({
      where: {
        responsibleId: me,
        status: "PENDING",
        OR: [{ capa: { status: "IN_PROGRESS" } }, { changeControl: { status: "APPROVED" } }],
      },
      include: { capa: { select: capa }, changeControl: { select: change } },
      orderBy: { dueDate: "asc" },
    }),
    qa
      ? db.changeControl.findMany({
          where: { status: "IN_ASSESSMENT", requesterId: { not: me } },
          select: change,
          orderBy: { updatedAt: "asc" },
        })
      : none,
    qa
      ? db.changeControl.findMany({
          where: { status: "IMPLEMENTED", requesterId: { not: me } },
          select: change,
          orderBy: { updatedAt: "asc" },
        })
      : none,
    db.changeControl.findMany({
      where: { status: "DRAFT", requesterId: me },
      select: change,
      orderBy: { updatedAt: "desc" },
    }),
    db.capa.findMany({
      where: {
        status: "IN_PROGRESS",
        ownerId: me,
        actions: { none: { status: "PENDING" }, some: { status: "DONE" } },
      },
      select: capa,
    }),
  ]);
  return {
    qa,
    toTriage,
    toInvestigate,
    devToClose,
    capaToApprove,
    capaToVerify,
    myActions,
    changesToAssess,
    changesToClose,
    myDrafts,
    capaReady,
  };
}

export async function countQualityInbox(ctx: ServiceContext) {
  const inbox = await getQualityInbox(ctx);
  return Object.entries(inbox).reduce(
    (n, [k, v]) => (k === "qa" || !Array.isArray(v) ? n : n + v.length),
    0,
  );
}
