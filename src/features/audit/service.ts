import type { Prisma } from "@prisma/client";
import type { TenantDb } from "@/server/db/tenant-client";

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilter = {
  action?: string;
  actor?: string;
  from?: Date;
  to?: Date;
  page?: number;
};

export async function listAuditLogs(db: TenantDb, filter: AuditFilter) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filter.action ? { action: { startsWith: filter.action } } : {}),
    ...(filter.actor ? { actorName: { contains: filter.actor } } : {}),
    ...(filter.from || filter.to
      ? {
          createdAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lte: filter.to } : {}),
          },
        }
      : {}),
  };
  const page = Math.max(1, filter.page ?? 1);
  const [items, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
    }),
    db.auditLog.count({ where }),
  ]);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)) };
}

/** Prefijos de acción para el filtro (auth, user, password_reset, organization…). */
export async function listAuditActionPrefixes(db: TenantDb) {
  const rows = await db.auditLog.groupBy({ by: ["action"], orderBy: { action: "asc" } });
  return [...new Set(rows.map((r) => r.action.split(".")[0] ?? r.action))];
}
