import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/card";
import { ResetRequestsList } from "@/features/reset-requests/components/reset-requests-list";
import { listResetRequests } from "@/features/reset-requests/service";
import { requireRole } from "@/server/auth/guards";
import { getTenantDb } from "@/server/db/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.resets");
  return { title: t("title") };
}

export default async function ResetRequestsPage() {
  const session = await requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  const t = await getTranslations("admin.resets");
  const rows = await listResetRequests(await getTenantDb());
  const view = rows.map((r) => ({
    id: r.id,
    status: r.status,
    note: r.note,
    resolutionNote: r.resolutionNote,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    user: {
      id: r.user.id,
      username: r.user.username,
      fullName: r.user.fullName,
      role: r.user.role,
    },
  }));
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <ResetRequestsList
        requests={view}
        currentUserId={session.user.id}
        actorRole={session.user.role}
      />
    </>
  );
}
