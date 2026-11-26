import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { InstallPwaButton } from "@/components/pwa/install-button";
import { Alert } from "@/components/ui/alert";
import { Icon } from "@/components/ui/icon";
import { LoginForm } from "@/features/auth/components/login-form";
import { SecurityIndicators } from "@/features/auth/components/security-indicators";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("login");
  return { title: t("metaTitle") };
}

const REASONS = {
  inactividad: "reasonInactivity",
  sesion: "reasonSession",
  clave: "reasonClave",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const t = await getTranslations("login");
  const tApp = await getTranslations("app");
  const reasonKey =
    params.motivo && params.motivo in REASONS
      ? REASONS[params.motivo as keyof typeof REASONS]
      : null;
  const callbackUrl = params.callbackUrl?.startsWith("/") ? params.callbackUrl : undefined;

  return (
    <main className="flex min-h-dvh flex-col lg:flex-row">
      {/* Columna izquierda: propuesta de valor e indicadores de seguridad */}
      <section className="bg-brand-900 relative order-2 overflow-hidden px-6 py-12 text-white sm:px-12 lg:order-1 lg:flex lg:w-[55%] lg:flex-col lg:justify-end lg:py-16">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(160,108,207,0.45),transparent_55%),radial-gradient(circle_at_85%_75%,rgba(90,36,140,0.9),transparent_60%)]"
        />
        <svg
          aria-hidden
          className="absolute -top-24 -right-24 size-[28rem] text-white/[0.06]"
          viewBox="0 0 45.2 39.1"
          fill="currentColor"
        >
          <path d="M33.9,0H11.3L0,19.5l11.3,19.6h22.6l11.3-19.6L33.9,0z M32.2,36.3H12.9L3.2,19.5l9.7-16.8h19.3l9.7,16.8 L32.2,36.3z" />
        </svg>
        <div className="relative max-w-xl">
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wider uppercase ring-1 ring-white/20">
            <Icon name="sparkle" className="size-3.5" />
            {tApp("tagline")}
          </p>
          <h2 className="text-3xl leading-tight font-bold sm:text-4xl lg:text-5xl">
            {t("headline")}
          </h2>
          <p className="text-brand-100 mt-5 text-base sm:text-lg">{t("subheadline")}</p>
          <ul className="mt-8 space-y-3 text-sm sm:text-base">
            {(["benefitGmp", "benefitBpadt", "benefitIso"] as const).map((k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                  <Icon name="check" className="size-3.5" />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
          <div className="mt-10 border-t border-white/15 pt-6">
            <SecurityIndicators
              availability={process.env.NEXT_PUBLIC_AVAILABILITY_TEXT ?? "99,5 %"}
            />
          </div>
        </div>
      </section>

      {/* Columna derecha: acceso */}
      <section className="order-1 flex flex-1 items-center justify-center bg-white px-4 py-10 sm:px-8 lg:order-2">
        <div className="w-full max-w-md">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <Image
                src="/brand/prophar-logo.svg"
                alt="PROPHAR"
                width={220}
                height={29}
                priority
                className="h-auto w-48 sm:w-56"
              />
              <p className="mt-2 text-sm font-semibold tracking-wide text-slate-500">
                {tApp("name")}
              </p>
            </div>
            <LanguageSwitcher compact />
          </div>

          <h1 className="mt-8 text-3xl font-bold text-slate-900">{t("welcome")}</h1>
          <p className="mt-1.5 text-slate-600">{t("instructions")}</p>

          <InstallPwaButton className="mt-5" />

          {reasonKey && (
            <Alert tone={reasonKey === "reasonClave" ? "success" : "info"} className="mt-5">
              {t(reasonKey)}
            </Alert>
          )}

          <div className="mt-6">
            <LoginForm callbackUrl={callbackUrl} />
          </div>

          <div className="mt-8 border-t border-slate-200 pt-5 text-center">
            <p className="text-xs leading-relaxed text-slate-500">{t("privateNotice")}</p>
            <p className="mt-3 text-xs font-medium text-slate-400">{t("footer")}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
