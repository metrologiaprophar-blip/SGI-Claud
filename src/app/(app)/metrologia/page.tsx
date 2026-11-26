import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AreaOverview } from "@/components/layout/area-overview";
import { MetrologyDashboard } from "@/components/metrology/metrology-dashboard";
import { getServiceContext } from "@/server/action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.areas");
  return { title: t("metrology") };
}

export default async function MetrologyArea() {
  const ctx = await getServiceContext();
  return (
    <>
      <AreaOverview slug="metrologia" />
      <MetrologyDashboard db={ctx.db} />
    </>
  );
}
