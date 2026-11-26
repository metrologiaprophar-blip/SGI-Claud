import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ChangeStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { ActionPlan } from "@/components/quality/action-plan";
import { ChangeFormFields } from "@/components/quality/change-form-fields";
import { SignaturesTable } from "@/components/quality/signatures-table";
import { StatusBadge } from "@/components/quality/status-badge";
import { Detail, Section, Stepper } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { Field, Select, Textarea } from "@/components/ui/field";
import {
  cancelChangeAction,
  closeChangeAction,
  decideChangeAction,
  markImplementedAction,
  saveAssessmentAction,
  submitChangeAction,
  updateChangeAction,
} from "@/features/change-control/actions";
import { getChange } from "@/features/change-control/service";
import { listAssignableUsers, listProcesses } from "@/features/documents/service";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const c = await ctx.db.changeControl.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: c?.code };
}

const STEP: Record<ChangeStatus, number> = {
  DRAFT: 0,
  IN_ASSESSMENT: 1,
  APPROVED: 3,
  IMPLEMENTED: 4,
  CLOSED: 5,
  REJECTED: -1,
  CANCELLED: -1,
};
const CLASSIFICATIONS = ["MINOR", "MAJOR", "CRITICAL"] as const;
const RISKS = ["LOW", "MEDIUM", "HIGH"] as const;

export default async function ChangePage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const c = await getChange(ctx.db, id);
  if (!c) notFound();
  const t = await getTranslations();
  const tc = await getTranslations("quality.change");
  const format = await getFormatter();
  const [qa, users, processes, tz] = await Promise.all([
    hasPermission(ctx, "QA_APPROVE"),
    listAssignableUsers(ctx.db),
    listProcesses(ctx.db),
    orgTimezone(ctx),
  ]);
  const today = todayInZone(tz);
  const me = ctx.actor.id;
  const isRequester = c.requesterId === me;
  const qaReviewer = qa && !isRequester;
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");
  const steps = ["proposal", "assessment", "approved", "implementation", "closure"].map((s) =>
    tc(`steps.${s}`),
  );
  const path = `/calidad/control-cambios/${c.id}`;
  const pending = c.actions.filter((a) => a.status === "PENDING").length;
  const yesNo = (v: boolean | null) =>
    v === null ? "—" : v ? tc("assessment.yes") : tc("assessment.no");
  const canCancel =
    (c.status === "DRAFT" && (isRequester || qa)) ||
    (qa && ["IN_ASSESSMENT", "APPROVED"].includes(c.status));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-brand-700 font-mono text-sm font-semibold">{c.code}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{c.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StatusBadge value={c.status} label={tc(`status.${c.status}`)} />
            {c.classification && (
              <StatusBadge
                value={c.classification}
                label={t(`quality.classification.${c.classification}`)}
              />
            )}
            <span>
              {c.process.code} · {tc(`type.${c.changeType}`)} · {c.requester.fullName}
            </span>
          </div>
        </div>
        {canCancel && (
          <ModalButton
            label={t("quality.common.cancel")}
            title={t("quality.common.cancelTitle")}
            variant="outline"
          >
            <ActionForm
              id="cancel-change"
              action={cancelChangeAction}
              hidden={{ id: c.id }}
              submitLabel={t("quality.common.cancel")}
            >
              <Field id="cn-reason" label={t("quality.common.reason")}>
                <Textarea id="cn-reason" name="reason" required minLength={5} maxLength={500} />
              </Field>
            </ActionForm>
          </ModalButton>
        )}
      </div>

      <Stepper steps={steps} current={STEP[c.status]} label={tc("steps.proposal")} />

      {c.status === "CANCELLED" && (
        <Alert tone="warning">
          {t("quality.common.cancelled", { reason: c.cancelReason ?? "" })}
        </Alert>
      )}
      {c.assessmentComment && ["DRAFT", "REJECTED"].includes(c.status) && (
        <Alert tone="warning">
          <strong>{tc("returned")}:</strong> {c.assessmentComment}
        </Alert>
      )}

      {/* Propuesta */}
      {c.status === "DRAFT" && isRequester ? (
        <Section title={tc("draft.title")}>
          <div className="space-y-6">
            <ActionForm
              id="edit-change"
              action={updateChangeAction}
              hidden={{ id: c.id }}
              submitLabel={tc("draft.save")}
              successMessage={t("quality.common.saved")}
            >
              <ChangeFormFields
                processes={processes}
                today={today}
                defaults={{
                  title: c.title,
                  description: c.description,
                  justification: c.justification,
                  changeType: c.changeType,
                  processId: c.processId,
                  affectedItems: c.affectedItems,
                  plannedDate: c.plannedDate ? todayInZone(tz, c.plannedDate) : undefined,
                }}
              />
            </ActionForm>
            <div className="border-t border-slate-100 pt-5">
              <h3 className="mb-3 font-semibold text-slate-900">{tc("draft.submitTitle")}</h3>
              <ActionForm
                id="submit-change"
                action={submitChangeAction}
                hidden={{ id: c.id }}
                submitLabel={tc("draft.submit")}
                signature={t("documents.meanings.AUTHORED")}
              />
            </div>
          </div>
        </Section>
      ) : (
        <Section title={tc("data")}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Detail label={tc("fields.description")}>{c.description}</Detail>
            </div>
            <div className="sm:col-span-3">
              <Detail label={tc("fields.justification")}>{c.justification}</Detail>
            </div>
            <Detail label={tc("fields.affectedItems")}>{c.affectedItems ?? "—"}</Detail>
            <Detail label={tc("fields.plannedDate")}>{date(c.plannedDate)}</Detail>
            <Detail label={tc("fields.requester")}>{c.requester.fullName}</Detail>
          </dl>
        </Section>
      )}

      {/* Evaluación */}
      {c.status === "IN_ASSESSMENT" && qaReviewer && (
        <Section title={tc("assessment.title")}>
          <ActionForm
            id="assessment"
            action={saveAssessmentAction}
            hidden={{ id: c.id }}
            submitLabel={tc("assessment.save")}
            successMessage={t("quality.common.saved")}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="as-class" label={tc("fields.classification")}>
                <Select
                  id="as-class"
                  name="classification"
                  required
                  defaultValue={c.classification ?? ""}
                >
                  <option value="" disabled>
                    —
                  </option>
                  {CLASSIFICATIONS.map((v) => (
                    <option key={v} value={v}>
                      {t(`quality.classification.${v}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="as-risk" label={tc("fields.riskLevel")}>
                <Select id="as-risk" name="riskLevel" required defaultValue={c.riskLevel ?? ""}>
                  <option value="" disabled>
                    —
                  </option>
                  {RISKS.map((v) => (
                    <option key={v} value={v}>
                      {t(`quality.riskLevel.${v}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="as-reg" label={tc("fields.regulatoryNotification")}>
                <Select
                  id="as-reg"
                  name="regulatoryNotification"
                  required
                  defaultValue={
                    c.regulatoryNotification === null ? "" : c.regulatoryNotification ? "yes" : "no"
                  }
                >
                  <option value="" disabled>
                    —
                  </option>
                  <option value="yes">{tc("assessment.yes")}</option>
                  <option value="no">{tc("assessment.no")}</option>
                </Select>
              </Field>
            </div>
            <Field id="as-quality" label={tc("fields.impactQuality")}>
              <Textarea
                id="as-quality"
                name="impactQuality"
                required
                minLength={5}
                maxLength={4000}
                defaultValue={c.impactQuality ?? ""}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="as-val" label={tc("fields.impactValidation")}>
                <Textarea
                  id="as-val"
                  name="impactValidation"
                  maxLength={2000}
                  defaultValue={c.impactValidation ?? ""}
                  className="min-h-14"
                />
              </Field>
              <Field id="as-docs" label={tc("fields.impactDocuments")}>
                <Textarea
                  id="as-docs"
                  name="impactDocuments"
                  maxLength={2000}
                  defaultValue={c.impactDocuments ?? ""}
                  className="min-h-14"
                />
              </Field>
              <Field id="as-train" label={tc("fields.impactTraining")}>
                <Textarea
                  id="as-train"
                  name="impactTraining"
                  maxLength={2000}
                  defaultValue={c.impactTraining ?? ""}
                  className="min-h-14"
                />
              </Field>
            </div>
          </ActionForm>
        </Section>
      )}
      {c.status !== "DRAFT" && c.status !== "IN_ASSESSMENT" && c.classification && (
        <Section title={tc("assessmentData")}>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Detail label={tc("fields.riskLevel")}>
              {c.riskLevel ? t(`quality.riskLevel.${c.riskLevel}`) : "—"}
            </Detail>
            <Detail label={tc("fields.regulatoryNotification")}>
              {yesNo(c.regulatoryNotification)}
            </Detail>
            <Detail label={tc("fields.assessmentComment")}>{c.assessmentComment ?? "—"}</Detail>
            <div className="sm:col-span-3">
              <Detail label={tc("fields.impactQuality")}>{c.impactQuality ?? "—"}</Detail>
            </div>
            <Detail label={tc("fields.impactValidation")}>{c.impactValidation ?? "—"}</Detail>
            <Detail label={tc("fields.impactDocuments")}>{c.impactDocuments ?? "—"}</Detail>
            <Detail label={tc("fields.impactTraining")}>{c.impactTraining ?? "—"}</Detail>
          </dl>
        </Section>
      )}
      {c.status === "IN_ASSESSMENT" && !qaReviewer && (
        <Alert tone="info">{t("quality.deviation.waitingQa")}</Alert>
      )}

      {/* Plan de implementación */}
      {c.status !== "DRAFT" && (
        <Section title={t("quality.actions.title")}>
          <ActionPlan
            actions={c.actions}
            parent={{ changeControlId: c.id }}
            path={path}
            currentUserId={me}
            canExecute={c.status === "APPROVED"}
            canCancel={qa && ["IN_ASSESSMENT", "APPROVED"].includes(c.status)}
            canAdd={c.status === "IN_ASSESSMENT" && qaReviewer}
            users={users}
            today={today}
          />
        </Section>
      )}

      {c.status === "IN_ASSESSMENT" && qaReviewer && (
        <Section title={tc("assessment.decisionTitle")}>
          <ActionForm
            id="decide-change"
            action={decideChangeAction}
            hidden={{ id: c.id }}
            signature={`${t("documents.meanings.APPROVED")} / ${t("documents.meanings.REJECTED")}`}
            decisions={[
              { value: "approve", label: tc("assessment.approve") },
              { value: "return", label: tc("assessment.return"), variant: "outline" },
              { value: "reject", label: tc("assessment.reject"), variant: "danger" },
            ]}
          >
            <Field
              id="dc-comment"
              label={t("quality.common.comment")}
              help={t("quality.common.commentHelp")}
            >
              <Textarea id="dc-comment" name="comment" maxLength={2000} className="min-h-14" />
            </Field>
          </ActionForm>
        </Section>
      )}

      {c.status === "APPROVED" && (isRequester || qa) && pending === 0 && (
        <Section title={tc("implement.title")}>
          <ActionForm
            id="implement"
            action={markImplementedAction}
            hidden={{ id: c.id }}
            submitLabel={tc("implement.submit")}
          >
            <p className="text-sm text-slate-600">{tc("implement.help")}</p>
          </ActionForm>
        </Section>
      )}

      {c.status === "IMPLEMENTED" &&
        (qaReviewer ? (
          <Section title={tc("close.title")}>
            <ActionForm
              id="close-change"
              action={closeChangeAction}
              hidden={{ id: c.id }}
              submitLabel={tc("close.submit")}
              signature={t("documents.meanings.VERIFIED")}
            >
              <Field id="cl-comment" label={tc("fields.closureComment")}>
                <Textarea id="cl-comment" name="comment" required minLength={10} maxLength={4000} />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{t("quality.deviation.waitingQa")}</Alert>
        ))}
      {c.closureComment && (
        <Section title={tc("fields.closureComment")}>
          <p className="text-sm whitespace-pre-line text-slate-700">{c.closureComment}</p>
        </Section>
      )}

      <Section title={t("quality.common.signatures")}>
        <SignaturesTable signatures={c.signatures} />
      </Section>

      <Link
        href="/calidad/control-cambios"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
