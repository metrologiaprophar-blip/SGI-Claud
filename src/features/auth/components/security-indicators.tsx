"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/ui/icon";

const subscribe = () => () => undefined;

/** Indicadores del login. "SSL" solo se muestra en verde si la página realmente se sirve por HTTPS. */
export function SecurityIndicators({ availability }: { availability: string }) {
  const t = useTranslations("login");
  const secure = useSyncExternalStore(
    subscribe,
    () => window.location.protocol === "https:",
    () => true,
  );
  const items = [
    {
      icon: "shield" as const,
      label: secure ? t("indicatorSsl") : t("indicatorNoSsl"),
      ok: secure,
    },
    {
      icon: "clock" as const,
      label: t("indicatorAvailability", { value: availability }),
      ok: true,
    },
    { icon: "database" as const, label: t("indicatorBackup"), ok: true },
  ];
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium">
      {items.map((i) => (
        <li key={i.icon} className="flex items-center gap-2">
          <span
            className={`grid size-7 place-items-center rounded-full ${i.ok ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-400/20 text-amber-200"}`}
          >
            <Icon name={i.icon} className="size-4" />
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
