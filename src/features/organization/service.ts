import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { diff, logAudit } from "@/server/audit";
import type { TenantDb } from "@/server/db/tenant-client";

export function getOrganization(db: TenantDb, organizationId: string) {
  return db.organization.findUnique({ where: { id: organizationId } });
}

export type UpdateOrganizationInput = {
  name: string;
  taxId?: string | null;
  timezone: string;
  passwordMaxAgeDays: number;
  sessionIdleMinutes: number;
};

export async function updateOrganization(
  ctx: ServiceContext,
  input: UpdateOrganizationInput,
  reason?: string,
) {
  const current = await getOrganization(ctx.db, ctx.actor.organizationId);
  if (!current) throw new ServiceError("not_found");
  const next = { ...input, name: input.name.trim(), taxId: input.taxId?.trim() || null };
  const changes = diff(current, next);
  if (!changes.changed) return current;
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.organization.update({ where: { id: current.id }, data: next });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "organization.update",
        entityType: "Organization",
        entityId: current.id,
        before: changes.before,
        after: changes.after,
        reason,
      },
      tx,
    );
    return updated;
  });
}
