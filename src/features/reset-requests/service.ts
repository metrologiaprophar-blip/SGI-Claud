import type { Prisma, ResetStatus } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import type { TenantDb } from "@/server/db/tenant-client";
import { assignTemporaryPassword } from "../users/service";

const include = {
  user: { select: { id: true, username: true, fullName: true, role: true, status: true } },
} satisfies Prisma.PasswordResetRequestInclude;

export type ResetRequestRow = Prisma.PasswordResetRequestGetPayload<{ include: typeof include }>;

/** Marca como caducadas las solicitudes pendientes vencidas. */
export function expireOldRequests(db: TenantDb) {
  return db.passwordResetRequest.updateMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
}

export async function listResetRequests(
  db: TenantDb,
  status?: ResetStatus,
): Promise<ResetRequestRow[]> {
  await expireOldRequests(db);
  return db.passwordResetRequest.findMany({
    where: status ? { status } : {},
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

export async function countPendingResetRequests(db: TenantDb, excludeUserId?: string) {
  return db.passwordResetRequest.count({
    where: {
      status: "PENDING",
      expiresAt: { gte: new Date() },
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
  });
}

async function loadPending(
  ctx: ServiceContext,
  tx: Parameters<Parameters<TenantDb["$transaction"]>[0]>[0],
  id: string,
) {
  const request = await tx.passwordResetRequest.findUnique({ where: { id }, include });
  if (!request) throw new ServiceError("not_found");
  if (request.status !== "PENDING" || request.expiresAt < new Date())
    throw new ServiceError("request_not_pending");
  // Segregación de funciones: nadie resuelve su propia solicitud.
  if (request.userId === ctx.actor.id) throw new ServiceError("cannot_resolve_own_request");
  if (request.user.role === "SUPER_ADMIN" && ctx.actor.role !== "SUPER_ADMIN")
    throw new ServiceError("forbidden");
  return request;
}

/** Aprueba: asigna clave temporal (mostrada una sola vez) y obliga a cambiarla. */
export async function approveResetRequest(ctx: ServiceContext, id: string, note?: string) {
  return ctx.db.$transaction(async (tx) => {
    const request = await loadPending(ctx, tx, id);
    const { temporaryPassword } = await assignTemporaryPassword(tx, request.userId);
    await tx.passwordResetRequest.update({
      where: { id },
      data: {
        status: "APPROVED",
        resolvedById: ctx.actor.id,
        resolvedAt: new Date(),
        resolutionNote: note?.trim() || null,
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "password_reset.approved",
        entityType: "PasswordResetRequest",
        entityId: id,
        before: { status: "PENDING" },
        after: { status: "APPROVED", userId: request.userId },
        reason: note,
      },
      tx,
    );
    return { username: request.user.username, fullName: request.user.fullName, temporaryPassword };
  });
}

export async function rejectResetRequest(ctx: ServiceContext, id: string, note: string) {
  if (!note.trim()) throw new ServiceError("reason_required");
  return ctx.db.$transaction(async (tx) => {
    await loadPending(ctx, tx, id);
    await tx.passwordResetRequest.update({
      where: { id },
      data: {
        status: "REJECTED",
        resolvedById: ctx.actor.id,
        resolvedAt: new Date(),
        resolutionNote: note.trim(),
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "password_reset.rejected",
        entityType: "PasswordResetRequest",
        entityId: id,
        before: { status: "PENDING" },
        after: { status: "REJECTED" },
        reason: note,
      },
      tx,
    );
  });
}
