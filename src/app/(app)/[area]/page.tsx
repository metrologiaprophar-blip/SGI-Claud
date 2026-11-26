import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AreaOverview } from "@/components/layout/area-overview";
import { findArea } from "@/config/navigation";

type Params = { params: Promise<{ area: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const area = findArea((await params).area);
  const t = await getTranslations("nav");
  return { title: area ? t(`areas.${area.key}`) : undefined };
}

export default async function AreaPage({ params }: Params) {
  return <AreaOverview slug={(await params).area} />;
}
