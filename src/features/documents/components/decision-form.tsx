"use client";

import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { decisionAction } from "../actions";
import { SignaturePassword } from "@/components/forms/signature-password";
import { useServiceForm } from "@/lib/use-service-form";

/** Firma de revisión o de aprobación, con opción de rechazar y devolver al autor. */
export function DecisionForm({
  versionId,
  documentId,
  stage,
}: {
  versionId: string;
  documentId: string;
  stage: "review" | "approval";
}) {
  const t = useTranslations("documents");
  const f = useServiceForm(decisionAction);
  const meaning = stage === "review" ? t("meanings.REVIEWED") : t("meanings.APPROVED");
  return (
    <form {...f.formProps} className="space-y-4">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="documentId" value={documentId} />
      <input type="hidden" name="stage" value={stage} />
      {f.error && <Alert tone="error">{f.error}</Alert>}
      <Field
        id={`dc-comment-${stage}`}
        label={t("decision.comment")}
        help={t("decision.commentHelp")}
      >
        <Textarea
          id={`dc-comment-${stage}`}
          name="comment"
          maxLength={1000}
          aria-describedby={`dc-comment-${stage}-help`}
        />
      </Field>
      <SignaturePassword
        id={`dc-password-${stage}`}
        meaning={meaning}
        error={f.fieldError("password")}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decision" value="approve" disabled={f.pending}>
          {stage === "review" ? t("decision.approveReview") : t("decision.approveApproval")}
        </Button>
        <Button type="submit" name="decision" value="reject" variant="outline" disabled={f.pending}>
          {t("decision.reject")}
        </Button>
      </div>
    </form>
  );
}
