import type { Prisma } from "@prisma/client";
import { prisma } from "./db/client";

/** Claves que nunca se registran: password, newPassword, passwordHash, passwordHistory, token, apiSecret… */
const SECRET_KEY = /(password|hash|passwordhistory|token|secret)$/i;

/** Elimina claves sensibles y devuelve un valor serializable. */
export function sanitize(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined;
  const walk = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object" && v !== null) {
      return Object.fromEntries(
        Object.entries(v)
          .filter(([k]) => !SECRET_KEY.test(k))
          .map(([k, val]) => [k, walk(val)]),
      );
    }
    return v;
  };
  return walk(value) as Prisma.InputJsonValue;
}

export type AuditEntry = {
  organizationId?: string | null;
  actor?: { id: string; name?: string | null } | null;
  action: string;
  entityType?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  ip?: string | null;
  userAgent?: string | null;
};

/** Cualquier cliente o transacción capaz de insertar en AuditLog (base o de empresa). */
export type AuditWriter = {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
};

/** Registra un evento en el registro de auditoría (solo inserción). Pasar `db` = transacción para atomicidad. */
export async function logAudit(entry: AuditEntry, db: AuditWriter = prisma) {
  await db.auditLog.create({
    data: {
      organizationId: entry.organizationId ?? null,
      actorId: entry.actor?.id ?? null,
      actorName: entry.actor?.name ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: sanitize(entry.before),
      after: sanitize(entry.after),
      reason: entry.reason,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent?.slice(0, 300) ?? null,
    },
  });
}

/** Devuelve solo los campos que cambiaron, para registrar before/after compactos. */
export function diff<T extends Record<string, unknown>>(before: T, after: Partial<T>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = before[key];
    const next = after[key];
    const same =
      prev instanceof Date && next instanceof Date
        ? prev.getTime() === next.getTime()
        : prev === next;
    if (!same) {
      b[key] = prev;
      a[key] = next;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
