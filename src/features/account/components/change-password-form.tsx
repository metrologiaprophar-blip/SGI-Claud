"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { describedBy, Field } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { changePasswordAction } from "../actions";
import { logoutAction } from "@/features/auth/actions";

export function ChangePasswordForm({ forced }: { username: string; forced: boolean }) {
  const t = useTranslations("changePassword");
  const tc = useTranslations("common");
  const { formError, fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  const err =
    state && !state.ok && state.error.code !== "validation" ? formError(state) : undefined;
  const fields = ["currentPassword", "newPassword", "confirmPassword"] as const;
  const labels = {
    currentPassword: t("current"),
    newPassword: t("new"),
    confirmPassword: t("confirm"),
  };
  const autocomplete = {
    currentPassword: "current-password",
    newPassword: "new-password",
    confirmPassword: "new-password",
  };

  return (
    <>
      <form
        action={formAction}
        onSubmit={submitWithoutReset(formAction)}
        className="space-y-4"
        noValidate
      >
        {err && <Alert tone="error">{err}</Alert>}
        {fields.map((f) => {
          const e = fieldError(state, f);
          const help = f === "newPassword" ? t("rules") : undefined;
          return (
            <Field key={f} id={f} label={labels[f]} error={e} help={help}>
              <PasswordInput
                id={f}
                name={f}
                autoComplete={autocomplete[f]}
                required
                aria-invalid={!!e}
                aria-describedby={describedBy(f, e, help)}
              />
            </Field>
          );
        })}
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? tc("saving") : t("submit")}
        </Button>
        {!forced && (
          <Link href="/inicio" className={buttonClass("ghost", "md", "w-full")}>
            {tc("cancel")}
          </Link>
        )}
      </form>
      {forced && (
        <form action={logoutAction} className="mt-2">
          <button type="submit" className={buttonClass("ghost", "md", "w-full")}>
            {t("logout")}
          </button>
        </form>
      )}
    </>
  );
}
