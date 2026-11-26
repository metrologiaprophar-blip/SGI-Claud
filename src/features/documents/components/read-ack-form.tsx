"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acknowledgeReadAction } from "../actions";
import { SignaturePassword } from "./signature-password";
import { useDocForm } from "./use-doc-form";

export function ReadAckForm({ versionId, documentId }: { versionId: string; documentId: string }) {
  const t = useTranslations("documents");
  const f = useDocForm(acknowledgeReadAction);
  return (
    <form {...f.formProps} className="space-y-3">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="documentId" value={documentId} />
      {f.error && <Alert tone="error">{f.error}</Alert>}
      <p className="text-sm text-slate-700">{t("read.text")}</p>
      <SignaturePassword
        id="ra-password"
        meaning={t("meanings.READ")}
        error={f.fieldError("password")}
      />
      <Button type="submit" disabled={f.pending}>
        {t("read.submit")}
      </Button>
    </form>
  );
}
