import type { Metadata } from "next";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { ChangePasswordForm } from "@/features/account/components/change-password-form";
import { requireSessionAllowingPasswordChange } from "@/server/auth/guards";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("changePassword");
  return { title: t("title") };
}

export default async function ChangePasswordPage() {
  const session = await requireSessionAllowingPasswordChange();
  const t = await getTranslations("changePassword");
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <Image
          src="/brand/prophar-logo.svg"
          alt="PROPHAR"
          width={200}
          height={26}
          className="h-auto w-44"
        />
        <h1 className="mt-6 text-2xl font-bold text-slate-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {session.user.fullName} · {session.user.organizationCode}
        </p>
        {session.user.mustChangePassword && (
          <Alert tone="warning" className="mt-4">
            {t("forced")}
          </Alert>
        )}
        <div className="mt-6">
          <ChangePasswordForm
            username={session.user.username}
            forced={session.user.mustChangePassword}
          />
        </div>
      </div>
    </main>
  );
}
