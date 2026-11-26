import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { findTool } from "@/config/navigation";
import { requireSession } from "@/server/auth/guards";

type Params = { params: Promise<{ area: string; tool: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { area, tool } = await params;
  const match = findTool(area, tool);
  const t = await getTranslations("nav");
  return { title: match ? t(`tools.${match.tool.key}`) : undefined };
}

/** Herramientas de fases posteriores: página "Próximamente" con su descripción. */
export default async function ToolPlaceholderPage({ params }: Params) {
  const session = await requireSession();
  const { area, tool } = await params;
  const match = findTool(area, tool);
  if (!match || (match.area.roles && !match.area.roles.includes(session.user.role))) notFound();
  const t = await getTranslations("nav");

  return (
    <Card className="mx-auto max-w-2xl p-8 text-center sm:p-12">
      <span className="bg-brand-50 text-brand-700 mx-auto grid size-14 place-items-center rounded-2xl">
        <Icon name={match.area.icon} className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-slate-900">{t(`tools.${match.tool.key}`)}</h1>
      <p className="mt-2 text-slate-600">{t(`toolDescriptions.${match.tool.key}`)}</p>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Badge tone="warning">{t("comingSoon")}</Badge>
        <p className="text-sm text-slate-500">{t("comingSoonText", { phase: match.tool.phase })}</p>
      </div>
    </Card>
  );
}
