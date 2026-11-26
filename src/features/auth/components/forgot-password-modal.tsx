"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { forgotPasswordAction } from "../actions";

export function ForgotPasswordModal({
  open,
  onClose,
  defaultOrgCode,
}: {
  open: boolean;
  onClose: () => void;
  defaultOrgCode: string;
}) {
  const t = useTranslations();
  const { fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(forgotPasswordAction, null);
  const done = state?.ok === true;
  const orgErr = fieldError(state, "organizationCode");
  const userErr = fieldError(state, "username");

  return (
    <Modal open={open} onClose={onClose} title={t("forgot.title")}>
      {done ? (
        <div className="space-y-4">
          <Alert tone="success">{t("forgot.done")}</Alert>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {t("common.close")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          action={formAction}
          onSubmit={submitWithoutReset(formAction)}
          className="space-y-4"
          noValidate
        >
          <p className="text-sm text-slate-600">{t("forgot.intro")}</p>
          <Field id="fp-org" label={t("login.organizationCode")} error={orgErr}>
            <Input
              id="fp-org"
              name="organizationCode"
              defaultValue={defaultOrgCode}
              autoCapitalize="characters"
              className="uppercase"
              required
              aria-invalid={!!orgErr}
              aria-describedby={describedBy("fp-org", orgErr)}
            />
          </Field>
          <Field id="fp-user" label={t("login.username")} error={userErr}>
            <Input
              id="fp-user"
              name="username"
              autoCapitalize="none"
              required
              aria-invalid={!!userErr}
              aria-describedby={describedBy("fp-user", userErr)}
            />
          </Field>
          <Field id="fp-note" label={t("forgot.note")}>
            <Textarea
              id="fp-note"
              name="note"
              maxLength={500}
              placeholder={t("forgot.notePlaceholder")}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? t("forgot.submitting") : t("forgot.submit")}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
