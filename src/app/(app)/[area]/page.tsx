import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { CURRENT_PHASE, findArea, toolHref } from "@/config/navigation";
import { requireSession } from "@/server/auth/guards";

type Params = { params: Promise<{ area: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const area = findArea((await params).area);
  const t = await getTranslations("nav");
  return { title: area ? t(`areas.${area.key}`) : undefined };
}

/** Portada de un área: lista sus herramientas con su estado (disponible / fase prevista). */
export default async function AreaPage({ params }: Params) {
  const session = await requireSession();
  const area = findArea((await params).area);
  if (!area || (area.roles && !area.roles.includes(session.user.role))) notFound();
  const t = await getTranslations("nav");

  return (
    <>
      <PageHeader title={t(`areas.${area.key}`)} subtitle={t(`areaDescriptions.${area.key}`)} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {area.tools.map((tool) => (
          <Link key={tool.key} href={toolHref(area, tool)} className="group">
            <Card className="group-hover:border-brand-300 h-full p-5 transition-all group-hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h2 className="group-hover:text-brand-800 font-semibold text-slate-900">
                  {t(`tools.${tool.key}`)}
                </h2>
                {tool.phase <= CURRENT_PHASE ? (
                  <Badge tone="success">{t("available")}</Badge>
                ) : (
                  <Badge>{t("phase", { phase: tool.phase })}</Badge>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-600">{t(`toolDescriptions.${tool.key}`)}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {tool.standards.map((s) => (
                  <Badge key={s} tone="brand">
                    {t(`standards.${s}`)}
                  </Badge>
                ))}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
