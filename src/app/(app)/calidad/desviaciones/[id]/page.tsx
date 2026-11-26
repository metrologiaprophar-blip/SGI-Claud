import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { DeviationStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { CapaFormFields } from "@/components/quality/capa-form-fields";
import { SignaturesTable } from "@/components/quality/signatures-table";
import { StatusBadge } from "@/components/quality/status-badge";
import { Detail, Section, Stepper } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createCapaAction } from "@/features/capa/actions";
import { listAssignableUsers } from "@/features/documents/service";
import {
  closeDeviationAction,
  dismissDeviationAction,
  saveInvestigationAction,
  submitInvestigationAction,
  triageDeviationAction,
} from "@/features/deviations/actions";
import { getDeviation } from "@/features/deviations/service";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const d = await ctx.db.deviation.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: d?.code };
}

const STEP: Record<DeviationStatus, number> = {
  REPORTED: 1,
  UNDER_INVESTIGATION: 2,
  PENDING_QA: 3,
  CLOSED: 5,
  CANCELLED: -1,
};
const CLASSIFICATIONS = ["MINOR", "MAJOR", "CRITICAL"] as const;
const METHODS = ["FIVE_WHYS", "ISHIKAWA", "FAULT_TREE", "OTHER"] as const;

export default async function DeviationPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const d = await getDeviation(ctx.db, id);
  if (!d) notFound();
  const t = await getTranslations();
  const tq = await getTranslations("quality.deviation");
  const format = await getFormatter();
  const [qa, users, tz] = await Promise.all([
    hasPermission(ctx, "QA_APPROVE"),
    listAssignableUsers(ctx.db),
    orgTimezone(ctx),
  ]);
  const today = todayInZone(tz);
  const me = ctx.actor.id;
  const isInvestigator = d.investigatorId === me;
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");
  const steps = ["detection", "triage", "investigation", "review", "closure"].map((s) =>
    tq(`steps.${s}`),
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="text-brand-700 font-mono text-sm font-semibold">{d.code}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{d.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <StatusBadge value={d.status} label={tq(`status.${d.status}`)} />
          {d.classification && (
            <StatusBadge
              value={d.classification}
              label={t(`quality.classification.${d.classification}`)}
            />
          )}
          <span>
            {d.process.code} · {tq(`category.${d.category}`)}
          </span>
        </div>
      </div>

      <Stepper steps={steps} current={STEP[d.status]} label={tq("steps.detection")} />

      {d.status === "CANCELLED" && (
        <Alert tone="warning">
          {t("quality.common.cancelled", { reason: d.cancelReason ?? "" })}
        </Alert>
      )}
      {d.returnComment && d.status === "UNDER_INVESTIGATION" && (
        <Alert tone="warning">
          <strong>{tq("returned")}:</strong> {d.returnComment}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title={tq("detection")} className="xl:col-span-2">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Detail label={tq("fields.description")}>{d.description}</Detail>
            </div>
            <Detail label={tq("fields.immediateAction")}>{d.immediateAction}</Detail>
            <Detail label={tq("fields.batches")}>{d.batches ?? "—"}</Detail>
            <Detail label={tq("fields.location")}>{d.location ?? "—"}</Detail>
            <Detail label={tq("fields.detectedAt")}>{date(d.detectedAt)}</Detail>
          </dl>
        </Section>
        <Section title={t("quality.common.status")}>
          <dl className="space-y-3 text-sm">
            <Detail label={tq("fields.reportedBy")}>{d.reportedBy.fullName}</Detail>
            <Detail label={tq("fields.investigator")}>{d.investigator?.fullName ?? "—"}</Detail>
            <Detail label={tq("fields.dueDate")}>{date(d.dueDate)}</Detail>
            <Detail label={tq("fields.capaRequired")}>
              {d.capaRequired
                ? t("quality.change.assessment.yes")
                : t("quality.change.assessment.no")}
            </Detail>
            {d.triageComment && (
              <Detail label={tq("fields.triageComment")}>{d.triageComment}</Detail>
            )}
          </dl>
        </Section>
      </div>

      {/* Paso 2: clasificación por QA */}
      {d.status === "REPORTED" &&
        (qa ? (
          <Section
            title={tq("triage.title")}
            actions={
              <ModalButton
                label={tq("triage.dismiss")}
                title={tq("triage.dismiss")}
                variant="outline"
                size="sm"
              >
                <ActionForm
                  id="dismiss"
                  action={dismissDeviationAction}
                  hidden={{ id: d.id }}
                  submitLabel={tq("triage.dismiss")}
                >
                  <p className="text-sm text-slate-600">{tq("triage.dismissHelp")}</p>
                  <Field id="dm-reason" label={t("quality.common.reason")}>
                    <Textarea id="dm-reason" name="reason" required minLength={5} maxLength={500} />
                  </Field>
                </ActionForm>
              </ModalButton>
            }
          >
            <ActionForm
              id="triage"
              action={triageDeviationAction}
              hidden={{ id: d.id }}
              submitLabel={tq("triage.submit")}
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  id="tr-class"
                  label={tq("fields.classification")}
                  help={tq("triage.criticalNote")}
                >
                  <Select id="tr-class" name="classification" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {CLASSIFICATIONS.map((c) => (
                      <option key={c} value={c}>
                        {t(`quality.classification.${c}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="tr-inv" label={tq("fields.investigator")}>
                  <Select id="tr-inv" name="investigatorId" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="tr-due" label={tq("fields.dueDate")} help={tq("triage.dueHelp")}>
                  <Input id="tr-due" name="dueDate" type="date" min={today} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="capaRequired" className="accent-brand-700" />
                {tq("fields.capaRequired")}
              </label>
              <Field id="tr-comment" label={tq("fields.triageComment")}>
                <Textarea id="tr-comment" name="comment" maxLength={1000} className="min-h-14" />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{tq("waitingQa")}</Alert>
        ))}

      {/* Paso 3: investigación */}
      {["UNDER_INVESTIGATION", "PENDING_QA", "CLOSED"].includes(d.status) && (
        <Section title={tq("investigation.title")}>
          {d.status === "UNDER_INVESTIGATION" && isInvestigator ? (
            <div className="space-y-6">
              <ActionForm
                id="investigation"
                action={saveInvestigationAction}
                hidden={{ id: d.id }}
                submitLabel={tq("investigation.save")}
                successMessage={t("quality.common.saved")}
              >
                <Field id="iv-method" label={tq("fields.rootCauseMethod")}>
                  <Select
                    id="iv-method"
                    name="rootCauseMethod"
                    defaultValue={d.rootCauseMethod ?? ""}
                    className="sm:max-w-xs"
                  >
                    <option value="">—</option>
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {tq(`rootCauseMethod.${m}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="iv-root" label={tq("fields.rootCause")}>
                  <Textarea
                    id="iv-root"
                    name="rootCause"
                    defaultValue={d.rootCause ?? ""}
                    maxLength={4000}
                  />
                </Field>
                <Field id="iv-impact" label={tq("fields.impactAssessment")}>
                  <Textarea
                    id="iv-impact"
                    name="impactAssessment"
                    defaultValue={d.impactAssessment ?? ""}
                    maxLength={4000}
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="iv-disp" label={tq("fields.productDisposition")}>
                    <Textarea
                      id="iv-disp"
                      name="productDisposition"
                      defaultValue={d.productDisposition ?? ""}
                      maxLength={2000}
                      className="min-h-14"
                    />
                  </Field>
                  <Field id="iv-concl" label={tq("fields.conclusion")}>
                    <Textarea
                      id="iv-concl"
                      name="conclusion"
                      defaultValue={d.conclusion ?? ""}
                      maxLength={2000}
                      className="min-h-14"
                    />
                  </Field>
                </div>
              </ActionForm>
              <div className="border-t border-slate-100 pt-5">
                <h3 className="mb-3 font-semibold text-slate-900">
                  {tq("investigation.submitTitle")}
                </h3>
                {d.capaRequired && d.capas.every((c) => c.status === "CANCELLED") && (
                  <Alert tone="warning" className="mb-3">
                    {tq("investigation.capaHint")}
                  </Alert>
                )}
                <ActionForm
                  id="submit-investigation"
                  action={submitInvestigationAction}
                  hidden={{ id: d.id }}
                  submitLabel={tq("investigation.submit")}
                  signature={t("documents.meanings.AUTHORED")}
                />
              </div>
            </div>
          ) : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label={tq("fields.rootCauseMethod")}>
                {d.rootCauseMethod ? tq(`rootCauseMethod.${d.rootCauseMethod}`) : "—"}
              </Detail>
              <Detail label={tq("fields.conclusion")}>{d.conclusion ?? "—"}</Detail>
              <div className="sm:col-span-2">
                <Detail label={tq("fields.rootCause")}>{d.rootCause ?? "—"}</Detail>
              </div>
              <div className="sm:col-span-2">
                <Detail label={tq("fields.impactAssessment")}>{d.impactAssessment ?? "—"}</Detail>
              </div>
              <Detail label={tq("fields.productDisposition")}>{d.productDisposition ?? "—"}</Detail>
              {d.status === "UNDER_INVESTIGATION" && (
                <p className="text-slate-500">
                  {tq("waiting", { name: d.investigator?.fullName ?? "" })}
                </p>
              )}
            </dl>
          )}
        </Section>
      )}

      {/* CAPA vinculadas */}
      {d.status !== "REPORTED" && d.status !== "CANCELLED" && (
        <Section
          title={tq("linkedCapas")}
          actions={
            ["UNDER_INVESTIGATION", "PENDING_QA"].includes(d.status) && (isInvestigator || qa) ? (
              <ModalButton
                label={tq("investigation.newCapa")}
                title={tq("investigation.newCapa")}
                size="sm"
                variant="secondary"
                testId="new-linked-capa"
              >
                <ActionForm
                  id="linked-capa"
                  action={createCapaAction}
                  submitLabel={t("quality.capa.new")}
                >
                  <CapaFormFields
                    users={users}
                    today={today}
                    deviation={{ id: d.id, code: d.code }}
                    defaultOwnerId={d.investigatorId ?? undefined}
                    defaults={{
                      title: d.title,
                      problemStatement: d.description,
                      rootCause: d.rootCause,
                    }}
                  />
                </ActionForm>
              </ModalButton>
            ) : null
          }
        >
          {d.capas.length === 0 ? (
            <p className="text-sm text-slate-500">{t("common.none")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.capas.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/calidad/capa/${c.id}`} className="hover:text-brand-800">
                    <span className="text-brand-700 font-mono font-semibold">{c.code}</span> ·{" "}
                    {c.title}
                  </Link>
                  <StatusBadge value={c.status} label={t(`quality.capa.status.${c.status}`)} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {/* Paso 4: revisión y cierre por QA */}
      {d.status === "PENDING_QA" &&
        (qa && !isInvestigator ? (
          <Section title={tq("review.title")}>
            <ActionForm
              id="close-deviation"
              action={closeDeviationAction}
              hidden={{ id: d.id }}
              signature={`${t("documents.meanings.APPROVED")} / ${t("documents.meanings.REJECTED")}`}
              decisions={[
                { value: "approve", label: tq("review.approve") },
                { value: "reject", label: tq("review.reject"), variant: "outline" },
              ]}
            >
              <Field
                id="cl-comment"
                label={t("quality.common.comment")}
                help={t("quality.common.commentHelp")}
              >
                <Textarea id="cl-comment" name="comment" maxLength={2000} className="min-h-14" />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{tq("waitingQa")}</Alert>
        ))}

      <Section title={t("quality.common.signatures")}>
        <SignaturesTable signatures={d.signatures} />
      </Section>

      <Link
        href="/calidad/desviaciones"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
