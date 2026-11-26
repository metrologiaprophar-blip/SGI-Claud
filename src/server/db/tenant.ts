import { cache } from "react";
import { prisma } from "./client";
import { createTenantClient, type TenantDb } from "./tenant-client";
import { requireSession } from "../auth/guards";

export type { TenantDb };

/** Cliente de base de datos limitado a la empresa de la sesión actual. */
export const getTenantDb = cache(async (): Promise<TenantDb> => {
  const session = await requireSession();
  return createTenantClient(prisma, session.user.organizationId);
});

/** Para lógica de servidor que ya conoce la empresa (p. ej. tests o tareas internas). */
export function tenantDbFor(organizationId: string): TenantDb {
  return createTenantClient(prisma, organizationId);
}
