import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/card";
import { CreateUserButton } from "@/features/users/components/create-user-button";
import { UsersTable } from "@/features/users/components/users-table";
import { listUsers } from "@/features/users/service";
import { requireRole } from "@/server/auth/guards";
import { getTenantDb } from "@/server/db/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.users");
  return { title: t("title") };
}

export default async function UsersPage() {
  const session = await requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  const t = await getTranslations("admin.users");
  const users = await listUsers(await getTenantDb());
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} actions={<CreateUserButton />} />
      <UsersTable
        users={users.map((u) => ({
          ...u,
          lockedUntil:
            u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil.toISOString() : null,
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
        currentUserId={session.user.id}
        actorRole={session.user.role}
      />
    </>
  );
}
