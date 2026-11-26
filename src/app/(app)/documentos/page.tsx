import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AreaOverview } from "@/components/layout/area-overview";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.areas");
  return { title: t("documents") };
}

export default function DocumentsArea() {
  return <AreaOverview slug="documentos" />;
}
