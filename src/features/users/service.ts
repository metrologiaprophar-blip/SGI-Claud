import { Prisma, type Role, type Status } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { normalizeUsername } from "@/lib/identity";
import { auditBase, type ServiceContext } from "@/server/context";
import { diff, logAudit } from "@/server/audit";
import { generateTemporaryPassword, hashPassword, nextHistory } from "@/server/auth/password";
import { parsePermissions, type Permission } from "@/lib/permissions";
import type { TenantDb } from "@/server/db/tenant-client";

export const ASSIGNABLE_ROLES: Role[] = ["ADMIN_EMPRESA", "USUARIO"];

const publicUserSelect = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  jobTitle: true,
  role: true,
  status: true,
  mustChangePassword: true,
  permissions: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

export type UserRow = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export function listUsers(db: TenantDb): Promise<UserRow[]> {
  return db.user.findMany({
    select: publicUserSelect,
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
  });
}

export type CreateUserInput = {
  username: string;
  fullName: string;
  email?: string | null;
  jobTitle?: string | null;
  role: Role;
};

/** Alta de usuario con clave temporal (se muestra una sola vez y debe cambiarse al entrar). */
export async function createUser(ctx: ServiceContext, input: CreateUserInput) {
  if (!ASSIGNABLE_ROLES.includes(input.role)) throw new ServiceError("role_not_allowed");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  try {
    const user = await ctx.db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId: ctx.actor.organizationId,
          username: normalizeUsername(input.username),
          fullName: input.fullName.trim(),
          email: input.email?.trim() || null,
          jobTitle: input.jobTitle?.trim() || null,
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
        select: publicUserSelect,
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "user.create",
          entityType: "User",
          entityId: created.id,
          after: {
            username: created.username,
            fullName: created.fullName,
            email: created.email,
            jobTitle: created.jobTitle,
            role: created.role,
          },
        },
        tx,
      );
      return created;
    });
    return { user, temporaryPassword };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ServiceError("username_taken");
    throw e;
  }
}

export type UpdateUserInput = {
  fullName: string;
  email?: string | null;
  jobTitle?: string | null;
  role: Role;
  status: Status;
  /** Permisos GMP; si se omite, no se modifican. */
  permissions?: Permission[];
};

export async function updateUser(
  ctx: ServiceContext,
  userId: string,
  input: UpdateUserInput,
  reason?: string,
) {
  const current = await ctx.db.user.findUnique({ where: { id: userId } });
  if (!current) throw new ServiceError("not_found");
  if (current.role === "SUPER_ADMIN" && ctx.actor.role !== "SUPER_ADMIN")
    throw new ServiceError("forbidden");
  const isSelf = current.id === ctx.actor.id;
  if (isSelf && (input.role !== current.role || input.status !== current.status)) {
    throw new ServiceError("cannot_change_own_role_or_status");
  }
  if (!isSelf && current.role !== "SUPER_ADMIN" && !ASSIGNABLE_ROLES.includes(input.role)) {
    throw new ServiceError("role_not_allowed");
  }
  if (current.role === "SUPER_ADMIN" && input.role !== "SUPER_ADMIN")
    throw new ServiceError("role_not_allowed");

  const next = {
    fullName: input.fullName.trim(),
    email: input.email?.trim() || null,
    jobTitle: input.jobTitle?.trim() || null,
    role: input.role,
    status: input.status,
    ...(input.permissions ? { permissions: [...new Set(input.permissions)].sort() } : {}),
  };
  const changes = diff(
    { ...current, permissions: parsePermissions(current.permissions).sort() },
    next,
  );
  if (!changes.changed) return current;

  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: next,
      select: publicUserSelect,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action:
          input.status !== current.status
            ? input.status === "SUSPENDED"
              ? "user.suspend"
              : "user.reactivate"
            : "user.update",
        entityType: "User",
        entityId: userId,
        before: changes.before,
        after: changes.after,
        reason,
      },
      tx,
    );
    return updated;
  });
}

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

/** Asigna una clave temporal: obliga a cambiarla, desbloquea la cuenta e invalida sesiones abiertas. */
export async function assignTemporaryPassword(tx: Tx, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new ServiceError("not_found");
  const temporaryPassword = generateTemporaryPassword();
  await tx.user.update({
    where: { id: userId },
    data: {
      passwordHash: await hashPassword(temporaryPassword),
      passwordHistory: nextHistory(user.passwordHash, user.passwordHistory),
      passwordChangedAt: new Date(),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  return { user, temporaryPassword };
}

/** Restablecimiento directo por el administrador (sin solicitud previa). */
export async function resetUserPassword(ctx: ServiceContext, userId: string, reason?: string) {
  if (userId === ctx.actor.id) throw new ServiceError("cannot_reset_own_password");
  return ctx.db.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!target) throw new ServiceError("not_found");
    if (target.role === "SUPER_ADMIN" && ctx.actor.role !== "SUPER_ADMIN")
      throw new ServiceError("forbidden");
    const { user, temporaryPassword } = await assignTemporaryPassword(tx, userId);
    await logAudit(
      {
        ...auditBase(ctx),
        action: "user.password.reset",
        entityType: "User",
        entityId: user.id,
        after: { mustChangePassword: true },
        reason,
      },
      tx,
    );
    return { username: user.username, temporaryPassword };
  });
}

/** Desbloqueo manual tras intentos fallidos. */
export async function unlockUser(ctx: ServiceContext, userId: string) {
  return ctx.db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new ServiceError("not_found");
    await tx.user.update({
      where: { id: userId },
      data: { lockedUntil: null, failedLoginCount: 0 },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "user.unlock",
        entityType: "User",
        entityId: userId,
        before: { lockedUntil: user.lockedUntil },
        after: { lockedUntil: null },
      },
      tx,
    );
  });
}
