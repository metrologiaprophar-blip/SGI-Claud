import { ServiceError } from "@/lib/errors";
import { parsePermissions, type Permission } from "@/lib/permissions";
import type { ServiceContext } from "./context";
import type { TenantDb } from "./db/tenant-client";

/** Permisos vigentes del usuario, leídos de la BD (una revocación tiene efecto inmediato). */
export async function permissionsOf(db: TenantDb, userId: string): Promise<Permission[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { permissions: true, status: true },
  });
  return user?.status === "ACTIVE" ? parsePermissions(user.permissions) : [];
}

export async function hasPermission(ctx: ServiceContext, permission: Permission) {
  return (await permissionsOf(ctx.db, ctx.actor.id)).includes(permission);
}

export async function requirePermission(ctx: ServiceContext, permission: Permission) {
  if (!(await hasPermission(ctx, permission))) throw new ServiceError("forbidden");
}
