import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="text-brand-700 text-6xl font-bold">404</p>
      <p className="text-slate-600">{t("errors.not_found")}</p>
      <Link href="/inicio" className={buttonClass("primary")}>
        {t("nav.home")}
      </Link>
    </main>
  );
}
