"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { areaHref, matchPath } from "@/config/navigation";
import { Icon } from "@/components/ui/icon";

export function Breadcrumbs() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const match = matchPath(pathname);
  if (!match) return null;
  return (
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
      <Link href="/inicio" className="hover:text-slate-800">
        {t("home")}
      </Link>
      <Icon name="chevronRight" className="size-3.5" />
      {match.area.basePath ? (
        <span>{t(`areas.${match.area.key}`)}</span>
      ) : (
        <Link href={areaHref(match.area)} className="hover:text-slate-800">
          {t(`areas.${match.area.key}`)}
        </Link>
      )}
      {match.tool && (
        <>
          <Icon name="chevronRight" className="size-3.5" />
          <span className="font-medium text-slate-800">{t(`tools.${match.tool.key}`)}</span>
        </>
      )}
    </nav>
  );
}
