"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { cancelDraftAction } from "../actions";
import { useDocForm } from "./use-doc-form";

function CancelForm({ versionId, documentId }: { versionId: string; documentId: string }) {
  const t = useTranslations("documents");
  const f = useDocForm(cancelDraftAction);
  return (
    <form {...f.formProps} className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="documentId" value={documentId} />
      {f.error && <Alert tone="error">{f.error}</Alert>}
      <p className="text-sm text-slate-600">{t("cancel.help")}</p>
      <Field id="cd-reason" label={t("detail.reason")}>
        <Textarea id="cd-reason" name="reason" maxLength={500} required />
      </Field>
      <Button type="submit" variant="danger" disabled={f.pending}>
        {t("cancel.submit")}
      </Button>
    </form>
  );
}

export function CancelDraftButton({
  versionId,
  documentId,
}: {
  versionId: string;
  documentId: string;
}) {
  const t = useTranslations("documents.cancel");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-red-700">
        {t("title")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("title")}>
        <CancelForm versionId={versionId} documentId={documentId} />
      </Modal>
    </>
  );
}
