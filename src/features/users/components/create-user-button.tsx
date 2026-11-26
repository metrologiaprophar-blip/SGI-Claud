"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Select } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { TemporaryPassword } from "@/components/ui/temporary-password";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { createUserAction } from "../actions";

function CreateUserForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const { formError, fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(createUserAction, null);

  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("admin.users.created")}</Alert>
        <TemporaryPassword username={state.data.username} password={state.data.temporaryPassword} />
        <div className="flex justify-end">
          <Button onClick={onClose}>{t("common.close")}</Button>
        </div>
      </div>
    );
  }

  const err =
    state && !state.ok && state.error.code !== "validation" ? formError(state) : undefined;
  const fe = (f: string) => fieldError(state, f);
  return (
    <form
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className="space-y-4"
      noValidate
    >
      {err && <Alert tone="error">{err}</Alert>}
      <Field
        id="cu-username"
        label={t("admin.users.username")}
        error={fe("username")}
        help={t("admin.users.usernameHelp")}
      >
        <Input
          id="cu-username"
          name="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-invalid={!!fe("username")}
          aria-describedby={describedBy("cu-username", fe("username"), true)}
        />
      </Field>
      <Field id="cu-fullName" label={t("admin.users.fullName")} error={fe("fullName")}>
        <Input id="cu-fullName" name="fullName" required aria-invalid={!!fe("fullName")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cu-email" label={t("admin.users.email")} error={fe("email")}>
          <Input id="cu-email" name="email" type="email" aria-invalid={!!fe("email")} />
        </Field>
        <Field id="cu-jobTitle" label={t("admin.users.jobTitle")} error={fe("jobTitle")}>
          <Input id="cu-jobTitle" name="jobTitle" />
        </Field>
      </div>
      <Field id="cu-role" label={t("admin.users.role")}>
        <Select id="cu-role" name="role" defaultValue="USUARIO">
          <option value="USUARIO">{t("roles.USUARIO")}</option>
          <option value="ADMIN_EMPRESA">{t("roles.ADMIN_EMPRESA")}</option>
        </Select>
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("common.create")}
        </Button>
      </div>
    </form>
  );
}

export function CreateUserButton() {
  const t = useTranslations("admin.users");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
        data-testid="new-user"
      >
        <Icon name="user" className="size-4" />
        {t("new")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("new")}>
        <CreateUserForm key={key} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
