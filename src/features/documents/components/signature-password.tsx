"use client";

import { useTranslations } from "next-intl";
import { describedBy, Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";

/** Bloque de firma electrónica: declaración, significado y reautenticación con contraseña. */
export function SignaturePassword({
  id,
  meaning,
  error,
}: {
  id: string;
  meaning: string;
  error?: string;
}) {
  const t = useTranslations("documents.signature");
  return (
    <div className="border-brand-200 bg-brand-50/60 space-y-2 rounded-lg border p-3">
      <p className="text-brand-900 text-xs leading-relaxed">{t("statement", { meaning })}</p>
      <Field id={id} label={t("password")} error={error}>
        <PasswordInput
          id={id}
          name="password"
          autoComplete="current-password"
          required
          aria-invalid={!!error}
          aria-describedby={describedBy(id, error)}
        />
      </Field>
    </div>
  );
}
