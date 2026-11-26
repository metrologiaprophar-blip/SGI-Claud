import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AreaOverview } from "@/components/layout/area-overview";
import { QualityInbox } from "@/components/quality/quality-inbox";
import { getServiceContext } from "@/server/action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.areas");
  return { title: t("quality") };
}

export default async function QualityArea() {
  const ctx = await getServiceContext();
  return (
    <>
      <AreaOverview slug="calidad" />
      <QualityInbox ctx={ctx} />
    </>
  );
}
