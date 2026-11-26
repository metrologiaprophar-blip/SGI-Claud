"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { createNewVersionAction } from "../actions";
import { useDocForm } from "./use-doc-form";

function NewVersionForm({ documentId, onDone }: { documentId: string; onDone: () => void }) {
  const t = useTranslations("documents.detail");
  const f = useDocForm(createNewVersionAction);
  useEffect(() => {
    if (f.done) onDone();
  }, [f.done, onDone]);
  return (
    <form {...f.formProps} className="space-y-3">
      <input type="hidden" name="documentId" value={documentId} />
      {f.error && <Alert tone="error">{f.error}</Alert>}
      <p className="text-sm text-slate-600">{t("newVersionHelp")}</p>
      <Field id="nv-summary" label={t("changeSummary")}>
        <Textarea id="nv-summary" name="changeSummary" maxLength={1000} required />
      </Field>
      <Button type="submit" disabled={f.pending}>
        {t("newVersion")}
      </Button>
    </form>
  );
}

export function NewVersionButton({ documentId }: { documentId: string }) {
  const t = useTranslations("documents.detail");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="new-version">
        {t("newVersion")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("newVersionTitle")}>
        <NewVersionForm documentId={documentId} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}
