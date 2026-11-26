import type { Role } from "@prisma/client";
import type { TenantDb } from "./db/tenant-client";
import type { RequestInfo } from "./request-info";
import type { AuditEntry } from "./audit";

export type Actor = { id: string; name: string; role: Role; organizationId: string };
export type ServiceContext = { db: TenantDb; actor: Actor; req: RequestInfo };

/** Campos comunes de auditoría a partir del contexto. */
export const auditBase = (
  ctx: ServiceContext,
): Pick<AuditEntry, "organizationId" | "actor" | "ip" | "userAgent"> => ({
  organizationId: ctx.actor.organizationId,
  actor: { id: ctx.actor.id, name: ctx.actor.name },
  ip: ctx.req.ip,
  userAgent: ctx.req.userAgent,
});
