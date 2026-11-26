"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { submitForReviewAction } from "../actions";
import { SignaturePassword } from "./signature-password";
import { useDocForm } from "./use-doc-form";

type UserOption = { id: string; fullName: string; jobTitle: string | null; canApprove: boolean };

export function SubmitReviewForm({
  versionId,
  documentId,
  users,
  currentUserId,
  defaultSummary,
  today,
}: {
  versionId: string;
  documentId: string;
  users: UserOption[];
  currentUserId: string;
  defaultSummary: string;
  today: string;
}) {
  const t = useTranslations();
  const f = useDocForm(submitForReviewAction);
  const others = users.filter((u) => u.id !== currentUserId);
  const [readers, setReaders] = useState<string[]>([]);
  const toggle = (id: string) =>
    setReaders((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const label = (u: UserOption) => (u.jobTitle ? `${u.fullName} · ${u.jobTitle}` : u.fullName);

  return (
    <form {...f.formProps} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="documentId" value={documentId} />
      {readers.map((id) => (
        <input key={id} type="hidden" name="readerIds" value={id} />
      ))}
      {f.error && <Alert tone="error">{f.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="sr-reviewer"
          label={t("documents.submit.reviewer")}
          error={f.fieldError("reviewerId")}
        >
          <Select id="sr-reviewer" name="reviewerId" defaultValue="" required>
            <option value="" disabled>
              {t("documents.submit.choose")}
            </option>
            {others.map((u) => (
              <option key={u.id} value={u.id}>
                {label(u)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="sr-approver"
          label={t("documents.submit.approver")}
          error={f.fieldError("approverId")}
          help={t("documents.submit.approverHelp")}
        >
          <Select id="sr-approver" name="approverId" defaultValue="" required>
            <option value="" disabled>
              {t("documents.submit.choose")}
            </option>
            {others
              .filter((u) => u.canApprove)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {label(u)}
                </option>
              ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          id="sr-date"
          label={t("documents.submit.effectiveDate")}
          error={f.fieldError("effectiveDate")}
        >
          <Input
            id="sr-date"
            name="effectiveDate"
            type="date"
            min={today}
            defaultValue={today}
            required
          />
        </Field>
        <Field
          id="sr-summary"
          label={t("documents.detail.changeSummary")}
          className="sm:col-span-2"
        >
          <Textarea
            id="sr-summary"
            name="changeSummary"
            defaultValue={defaultSummary}
            maxLength={1000}
            className="min-h-10"
          />
        </Field>
      </div>
      <fieldset>
        <div className="mb-1.5 flex items-center justify-between">
          <legend className="text-sm font-medium text-slate-700">
            {t("documents.submit.readers")}
          </legend>
          <button
            type="button"
            className="text-brand-700 text-xs font-semibold hover:underline"
            onClick={() => setReaders(users.map((u) => u.id))}
          >
            {t("documents.submit.selectAll")}
          </button>
        </div>
        <p className="mb-2 text-xs text-slate-500">{t("documents.submit.readersHelp")}</p>
        <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 p-3 sm:grid-cols-2">
          {users.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={readers.includes(u.id)}
                onChange={() => toggle(u.id)}
                className="accent-brand-700"
              />
              {label(u)}
            </label>
          ))}
        </div>
      </fieldset>
      <SignaturePassword
        id="sr-password"
        meaning={t("documents.meanings.AUTHORED")}
        error={f.fieldError("password")}
      />
      <Button type="submit" disabled={f.pending}>
        {f.pending ? t("common.saving") : t("documents.submit.submit")}
      </Button>
    </form>
  );
}
