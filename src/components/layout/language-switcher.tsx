"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocaleAction } from "@/features/account/actions";
import { localeLabels, locales } from "@/i18n/config";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

/** Selector de idioma (ES/EN/PT). Guarda la cookie y, con sesión, la preferencia del usuario. */
export function LanguageSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("language")}</span>
      <Icon name="globe" className="pointer-events-none absolute left-2.5 size-4 text-slate-500" />
      <select
        value={locale}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value;
          startTransition(async () => {
            await setLocaleAction(next);
            router.refresh();
          });
        }}
        className="focus:border-brand-500 h-9 appearance-none rounded-lg border border-slate-300 bg-white pr-7 pl-8 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none"
        data-testid="language-switcher"
      >
        {locales.map((l) => (
          <option key={l} value={l}>
            {compact ? l.toUpperCase() : `${l.toUpperCase()} · ${localeLabels[l]}`}
          </option>
        ))}
      </select>
      <Icon
        name="chevronDown"
        className="pointer-events-none absolute right-2 size-4 text-slate-500"
      />
    </label>
  );
}
