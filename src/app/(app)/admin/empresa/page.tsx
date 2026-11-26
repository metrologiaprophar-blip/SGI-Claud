import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/card";
import { OrganizationForm } from "@/features/organization/components/organization-form";
import { getOrganization } from "@/features/organization/service";
import { requireRole } from "@/server/auth/guards";
import { getTenantDb } from "@/server/db/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.org");
  return { title: t("title") };
}

export default async function OrganizationPage() {
  const session = await requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  const org = await getOrganization(await getTenantDb(), session.user.organizationId);
  if (!org) notFound();
  const t = await getTranslations("admin.org");
  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <OrganizationForm
        org={{
          code: org.code,
          name: org.name,
          taxId: org.taxId,
          timezone: org.timezone,
          passwordMaxAgeDays: org.passwordMaxAgeDays,
          sessionIdleMinutes: org.sessionIdleMinutes,
        }}
      />
    </>
  );
}
