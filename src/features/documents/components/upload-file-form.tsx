"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/ui/field";
import { uploadFileAction } from "../actions";
import { useDocForm } from "./use-doc-form";

export function UploadFileForm({
  versionId,
  documentId,
  hasFile,
}: {
  versionId: string;
  documentId: string;
  hasFile: boolean;
}) {
  const t = useTranslations("documents.upload");
  const f = useDocForm(uploadFileAction);
  return (
    <form {...f.formProps} className="space-y-3" encType="multipart/form-data">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="documentId" value={documentId} />
      {f.error && <Alert tone="error">{f.error}</Alert>}
      {f.done && <Alert tone="success">{t("uploaded")}</Alert>}
      <Field id={`file-${versionId}`} label={t("title")} help={t("help")}>
        <input
          id={`file-${versionId}`}
          name="file"
          type="file"
          accept=".pdf,.docx,.xlsx,.doc,.xls"
          required
          className={`${inputClass} file:bg-brand-50 file:text-brand-800 file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1 file:text-sm file:font-semibold`}
          aria-describedby={`file-${versionId}-help`}
        />
      </Field>
      <Button type="submit" variant={hasFile ? "outline" : "primary"} disabled={f.pending}>
        {f.pending ? t("uploading") : t("submit")}
      </Button>
    </form>
  );
}
