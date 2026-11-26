"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { PasswordInput } from "@/components/ui/password-input";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { loginAction } from "../actions";
import { ForgotPasswordModal } from "./forgot-password-modal";

const ORG_KEY = "sgi:orgCode";

export function LoginForm({ callbackUrl }: { callbackUrl?: string }) {
  const t = useTranslations("login");
  const { fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(loginAction, null);
  const [orgCode, setOrgCode] = useState("");
  // Campos controlados: React 19 reinicia los no controlados tras cada envío.
  const [username, setUsername] = useState("");
  const [remember, setRemember] = useState(true);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotKey, setForgotKey] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(ORG_KEY);
      // Recupera el ID corporativo recordado en este dispositivo (solo existe en el cliente).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setOrgCode(saved);
    } catch {
      /* almacenamiento no disponible */
    }
  }, []);

  function rememberOrg() {
    try {
      if (remember && orgCode.trim()) localStorage.setItem(ORG_KEY, orgCode.trim().toUpperCase());
      else localStorage.removeItem(ORG_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  const invalid = state && !state.ok && state.error.code === "invalid_credentials";
  const orgErr = fieldError(state, "organizationCode");
  const userErr = fieldError(state, "username");
  const passErr = fieldError(state, "password");

  return (
    <>
      <form
        action={formAction}
        onSubmit={(e) => {
          rememberOrg();
          submitWithoutReset(formAction)(e);
        }}
        className="space-y-5"
        noValidate
      >
        {callbackUrl && <input type="hidden" name="callbackUrl" value={callbackUrl} />}
        {invalid && <Alert tone="error">{t("invalidCredentials")}</Alert>}

        <Field id="organizationCode" label={t("organizationCode")} error={orgErr}>
          <div className="relative">
            <Icon
              name="building"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              id="organizationCode"
              name="organizationCode"
              value={orgCode}
              onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
              placeholder={t("organizationCodePlaceholder")}
              autoComplete="organization"
              autoCapitalize="characters"
              spellCheck={false}
              required
              className="pl-9 uppercase"
              aria-invalid={!!orgErr}
              aria-describedby={describedBy("organizationCode", orgErr)}
            />
          </div>
        </Field>

        <Field id="username" label={t("username")} error={userErr}>
          <div className="relative">
            <Icon
              name="user"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              id="username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t("usernamePlaceholder")}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="pl-9"
              aria-invalid={!!userErr}
              aria-describedby={describedBy("username", userErr)}
            />
          </div>
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-slate-700">
              {t("password")}
            </label>
            <button
              type="button"
              onClick={() => {
                setForgotKey((k) => k + 1);
                setForgotOpen(true);
              }}
              className="text-brand-700 hover:text-brand-900 text-sm font-semibold hover:underline"
            >
              {t("forgot")}
            </button>
          </div>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            aria-invalid={!!passErr}
            aria-describedby={describedBy("password", passErr)}
          />
          {passErr && (
            <p id="password-error" className="text-xs font-medium text-red-600">
              {passErr}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="text-brand-700 accent-brand-700 size-4 rounded border-slate-300"
          />
          {t("rememberOrg")}
        </label>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? t("submitting") : t("submit")}
          {!pending && <Icon name="chevronRight" className="size-5" />}
        </Button>
      </form>
      <ForgotPasswordModal
        key={forgotKey}
        open={forgotOpen}
        onClose={() => setForgotOpen(false)}
        defaultOrgCode={orgCode}
      />
    </>
  );
}
