"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import type { DocumentType } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { STANDARDS } from "@/config/navigation";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { createDocumentAction } from "../actions";

type Option = { id: string; label: string };
type Props = { processes: Option[]; users: Option[]; types: DocumentType[]; currentUserId: string };

function CreateDocumentForm({
  processes,
  users,
  types,
  currentUserId,
  onClose,
}: Props & { onClose: () => void }) {
  const t = useTranslations();
  const { formError, fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(createDocumentAction, null);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="nd-code"
          label={t("documents.form.code")}
          error={fe("code")}
          help={t("documents.form.codeHelp")}
        >
          <Input
            id="nd-code"
            name="code"
            className="font-mono uppercase"
            autoCapitalize="characters"
            required
            aria-invalid={!!fe("code")}
            aria-describedby={describedBy("nd-code", fe("code"), true)}
          />
        </Field>
        <Field id="nd-type" label={t("documents.form.type")}>
          <Select id="nd-type" name="type" defaultValue={types.includes("SOP") ? "SOP" : types[0]}>
            {types.map((ty) => (
              <option key={ty} value={ty}>
                {t(`documents.types.${ty}`)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="nd-title" label={t("documents.form.title")} error={fe("title")}>
        <Input id="nd-title" name="title" required aria-invalid={!!fe("title")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="nd-process" label={t("documents.form.process")} error={fe("processId")}>
          <Select
            id="nd-process"
            name="processId"
            defaultValue=""
            required
            aria-invalid={!!fe("processId")}
          >
            <option value="" disabled>
              {t("documents.submit.choose")}
            </option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="nd-owner" label={t("documents.form.owner")}>
          <Select id="nd-owner" name="ownerId" defaultValue={currentUserId}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">
          {t("documents.form.standards")}
        </legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {STANDARDS.map((s) => (
            <label key={s} className="flex items-center gap-1.5 text-sm text-slate-700">
              <input
                type="checkbox"
                name="standards"
                value={s}
                defaultChecked={s === "GMP"}
                className="accent-brand-700"
              />
              {t(`nav.standards.${s}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="nd-period"
          label={t("documents.form.reviewPeriod")}
          error={fe("reviewPeriodMonths")}
        >
          <Input
            id="nd-period"
            name="reviewPeriodMonths"
            type="number"
            min={6}
            max={60}
            defaultValue={24}
            aria-invalid={!!fe("reviewPeriodMonths")}
          />
        </Field>
        <Field id="nd-summary" label={t("documents.form.changeSummary")} className="sm:col-span-2">
          <Textarea id="nd-summary" name="changeSummary" maxLength={1000} className="min-h-10" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("common.saving") : t("documents.form.create")}
        </Button>
      </div>
    </form>
  );
}

export function CreateDocumentButton(props: Props) {
  const t = useTranslations("documents");
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button
        onClick={() => {
          setKey((k) => k + 1);
          setOpen(true);
        }}
        data-testid="new-document"
      >
        <Icon name="docs" className="size-4" />
        {t("list.new")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("list.new")} size="lg">
        <CreateDocumentForm key={key} {...props} onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}
