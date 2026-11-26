"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { updateOrganizationAction } from "../actions";

type Org = {
  code: string;
  name: string;
  taxId: string | null;
  timezone: string;
  passwordMaxAgeDays: number;
  sessionIdleMinutes: number;
};

export function OrganizationForm({ org }: { org: Org }) {
  const t = useTranslations();
  const { formError, fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(updateOrganizationAction, null);
  const fe = (f: string) => fieldError(state, f);
  const err =
    state && !state.ok && state.error.code !== "validation" ? formError(state) : undefined;

  return (
    <Card className="max-w-3xl p-6">
      <form
        action={formAction}
        onSubmit={submitWithoutReset(formAction)}
        className="space-y-5"
        noValidate
      >
        {state?.ok && <Alert tone="success">{t("common.saved")}</Alert>}
        {err && <Alert tone="error">{err}</Alert>}
        <Field id="org-code" label={t("admin.org.code")} help={t("admin.org.codeHelp")}>
          <Input
            id="org-code"
            value={org.code}
            disabled
            readOnly
            className="font-mono"
            aria-describedby="org-code-help"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="org-name" label={t("admin.org.name")} error={fe("name")}>
            <Input
              id="org-name"
              name="name"
              defaultValue={org.name}
              required
              aria-invalid={!!fe("name")}
            />
          </Field>
          <Field id="org-taxId" label={t("admin.org.taxId")} error={fe("taxId")}>
            <Input
              id="org-taxId"
              name="taxId"
              defaultValue={org.taxId ?? ""}
              aria-invalid={!!fe("taxId")}
            />
          </Field>
        </div>
        <h2 className="border-t border-slate-100 pt-5 text-base font-semibold text-slate-900">
          {t("admin.org.securityTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field id="org-timezone" label={t("admin.org.timezone")} error={fe("timezone")}>
            <Input
              id="org-timezone"
              name="timezone"
              defaultValue={org.timezone}
              required
              aria-invalid={!!fe("timezone")}
            />
          </Field>
          <Field
            id="org-pwd"
            label={t("admin.org.passwordMaxAgeDays")}
            error={fe("passwordMaxAgeDays")}
          >
            <Input
              id="org-pwd"
              name="passwordMaxAgeDays"
              type="number"
              min={30}
              max={365}
              defaultValue={org.passwordMaxAgeDays}
              aria-invalid={!!fe("passwordMaxAgeDays")}
            />
          </Field>
          <Field
            id="org-idle"
            label={t("admin.org.sessionIdleMinutes")}
            error={fe("sessionIdleMinutes")}
          >
            <Input
              id="org-idle"
              name="sessionIdleMinutes"
              type="number"
              min={5}
              max={240}
              defaultValue={org.sessionIdleMinutes}
              aria-invalid={!!fe("sessionIdleMinutes")}
            />
          </Field>
        </div>
        <Field
          id="org-reason"
          label={t("common.reason")}
          error={fe("reason")}
          help={t("common.reasonHelp")}
        >
          <Textarea
            id="org-reason"
            name="reason"
            maxLength={500}
            required
            aria-invalid={!!fe("reason")}
            aria-describedby={describedBy("org-reason", fe("reason"), true)}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
