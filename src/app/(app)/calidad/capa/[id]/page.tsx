import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { CapaStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { ActionPlan } from "@/components/quality/action-plan";
import { SignaturesTable } from "@/components/quality/signatures-table";
import { StatusBadge } from "@/components/quality/status-badge";
import { Detail, Section, Stepper } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  approveCapaPlanAction,
  cancelCapaAction,
  requestEffectivenessAction,
  verifyEffectivenessAction,
} from "@/features/capa/actions";
import { getCapa } from "@/features/capa/service";
import { listAssignableUsers } from "@/features/documents/service";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const c = await ctx.db.capa.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: c?.code };
}

const STEP: Record<CapaStatus, number> = {
  OPEN: 0,
  IN_PROGRESS: 2,
  EFFECTIVENESS_CHECK: 3,
  CLOSED: 5,
  CANCELLED: -1,
};

export default async function CapaPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const capa = await getCapa(ctx.db, id);
  if (!capa) notFound();
  const t = await getTranslations();
  const tc = await getTranslations("quality.capa");
  const format = await getFormatter();
  const [qa, users, tz] = await Promise.all([
    hasPermission(ctx, "QA_APPROVE"),
    listAssignableUsers(ctx.db),
    orgTimezone(ctx),
  ]);
  const today = todayInZone(tz);
  const me = ctx.actor.id;
  const isOwner = capa.ownerId === me;
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");
  const steps = ["plan", "approval", "execution", "effectiveness", "closure"].map((s) =>
    tc(`steps.${s}`),
  );
  const path = `/calidad/capa/${capa.id}`;
  const pending = capa.actions.filter((a) => a.status === "PENDING").length;
  const done = capa.actions.filter((a) => a.status === "DONE").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-brand-700 font-mono text-sm font-semibold">{capa.code}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{capa.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StatusBadge value={capa.status} label={tc(`status.${capa.status}`)} />
            <span>{tc(`type.${capa.type}`)}</span>
            <span>· {tc(`source.${capa.source}`)}</span>
            {capa.deviation && (
              <Link
                href={`/calidad/desviaciones/${capa.deviation.id}`}
                className="text-brand-700 font-mono hover:underline"
              >
                · {capa.deviation.code}
              </Link>
            )}
          </div>
        </div>
        {qa && ["OPEN", "IN_PROGRESS"].includes(capa.status) && (
          <ModalButton
            label={t("quality.common.cancel")}
            title={t("quality.common.cancelTitle")}
            variant="outline"
          >
            <ActionForm
              id="cancel-capa"
              action={cancelCapaAction}
              hidden={{ id: capa.id }}
              submitLabel={t("quality.common.cancel")}
            >
              <Field id="cc-reason" label={t("quality.common.reason")}>
                <Textarea id="cc-reason" name="reason" required minLength={5} maxLength={500} />
              </Field>
            </ActionForm>
          </ModalButton>
        )}
      </div>

      <Stepper steps={steps} current={STEP[capa.status]} label={tc("steps.plan")} />

      {capa.status === "CANCELLED" && (
        <Alert tone="warning">
          {t("quality.common.cancelled", { reason: capa.cancelReason ?? "" })}
        </Alert>
      )}
      {capa.returnComment && ["OPEN", "IN_PROGRESS"].includes(capa.status) && (
        <Alert tone="warning">
          <strong>{tc("returned")}:</strong> {capa.returnComment}
        </Alert>
      )}

      <Section title={tc("data")}>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Detail label={tc("fields.problemStatement")}>{capa.problemStatement}</Detail>
          </div>
          <div className="sm:col-span-3">
            <Detail label={tc("fields.rootCause")}>{capa.rootCause ?? "—"}</Detail>
          </div>
          <Detail label={tc("fields.owner")}>{capa.owner.fullName}</Detail>
          <Detail label={tc("fields.targetDate")}>{date(capa.targetDate)}</Detail>
          <Detail label={tc("fields.effectivenessDueDate")}>
            {date(capa.effectivenessDueDate)}
          </Detail>
          <div className="sm:col-span-3">
            <Detail label={tc("fields.effectivenessCriteria")}>{capa.effectivenessCriteria}</Detail>
          </div>
          {capa.effectivenessResult && (
            <div className="sm:col-span-3">
              <Detail label={tc("fields.effectivenessResult")}>{capa.effectivenessResult}</Detail>
            </div>
          )}
        </dl>
      </Section>

      <Section title={t("quality.actions.title")}>
        <ActionPlan
          actions={capa.actions}
          parent={{ capaId: capa.id }}
          path={path}
          currentUserId={me}
          canExecute={capa.status === "IN_PROGRESS"}
          canCancel={qa && ["OPEN", "IN_PROGRESS"].includes(capa.status)}
          canAdd={["OPEN", "IN_PROGRESS"].includes(capa.status) && (qa || isOwner)}
          users={users}
          today={today}
        />
      </Section>

      {capa.status === "OPEN" &&
        (qa && !isOwner ? (
          <Section title={tc("plan.title")}>
            {pending === 0 && (
              <Alert tone="info" className="mb-3">
                {tc("plan.needsActions")}
              </Alert>
            )}
            <ActionForm
              id="approve-plan"
              action={approveCapaPlanAction}
              hidden={{ id: capa.id }}
              signature={`${t("documents.meanings.APPROVED")} / ${t("documents.meanings.REJECTED")}`}
              decisions={[
                { value: "approve", label: tc("plan.approve") },
                { value: "reject", label: tc("plan.reject"), variant: "outline" },
              ]}
            >
              <Field
                id="ap-comment"
                label={t("quality.common.comment")}
                help={t("quality.common.commentHelp")}
              >
                <Textarea id="ap-comment" name="comment" maxLength={2000} className="min-h-14" />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{t("quality.deviation.waitingQa")}</Alert>
        ))}

      {capa.status === "IN_PROGRESS" && isOwner && pending === 0 && done > 0 && (
        <Section title={tc("request.title")}>
          <ActionForm
            id="request-effectiveness"
            action={requestEffectivenessAction}
            hidden={{ id: capa.id }}
            submitLabel={tc("request.submit")}
          >
            <p className="text-sm text-slate-600">{tc("request.help")}</p>
            <Field id="re-date" label={tc("fields.effectivenessDueDate")}>
              <Input
                id="re-date"
                name="effectivenessDueDate"
                type="date"
                min={today}
                className="sm:max-w-xs"
              />
            </Field>
          </ActionForm>
        </Section>
      )}

      {capa.status === "EFFECTIVENESS_CHECK" &&
        (qa && !isOwner ? (
          <Section title={tc("verify.title")}>
            <ActionForm
              id="verify-effectiveness"
              action={verifyEffectivenessAction}
              hidden={{ id: capa.id }}
              signature={`${t("documents.meanings.VERIFIED")} / ${t("documents.meanings.REJECTED")}`}
              decisions={[
                { value: "effective", label: tc("verify.effective") },
                { value: "not_effective", label: tc("verify.notEffective"), variant: "outline" },
              ]}
            >
              <Field
                id="ve-result"
                label={tc("fields.effectivenessResult")}
                help={tc("verify.help")}
              >
                <Textarea id="ve-result" name="result" required minLength={10} maxLength={4000} />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{t("quality.deviation.waitingQa")}</Alert>
        ))}

      <Section title={t("quality.common.signatures")}>
        <SignaturesTable signatures={capa.signatures} />
      </Section>

      <Link
        href="/calidad/capa"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
