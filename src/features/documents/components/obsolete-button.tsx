"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { obsoleteDocumentAction } from "../actions";
import { SignaturePassword } from "./signature-password";
import { useDocForm } from "./use-doc-form";

function ObsoleteForm({ documentId }: { documentId: string }) {
  const t = useTranslations("documents");
  const f = useDocForm(obsoleteDocumentAction);
  return (
    <form {...f.formProps} className="space-y-3">
      <input type="hidden" name="documentId" value={documentId} />
      {f.error && <Alert tone="error">{f.error}</Alert>}
      <p className="text-sm text-slate-600">{t("detail.obsoleteHelp")}</p>
      <Field id="ob-reason" label={t("detail.reason")}>
        <Textarea id="ob-reason" name="reason" maxLength={500} required />
      </Field>
      <SignaturePassword
        id="ob-password"
        meaning={t("meanings.OBSOLETED")}
        error={f.fieldError("password")}
      />
      <Button type="submit" variant="danger" disabled={f.pending}>
        {t("detail.obsolete")}
      </Button>
    </form>
  );
}

export function ObsoleteButton({ documentId }: { documentId: string }) {
  const t = useTranslations("documents.detail");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="text-red-700">
        {t("obsolete")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("obsolete")}>
        <ObsoleteForm documentId={documentId} />
      </Modal>
    </>
  );
}
