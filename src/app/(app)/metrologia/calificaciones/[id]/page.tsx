import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { SignaturesTable } from "@/components/quality/signatures-table";
import { Detail, Section } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { approveQualificationAction } from "@/features/metrology/actions";
import { getQualification } from "@/features/metrology/records";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const q = await ctx.db.qualification.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: q?.code };
}

export default async function QualificationPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const q = await getQualification(ctx.db, id);
  if (!q) notFound();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const qa = await hasPermission(ctx, "QA_APPROVE");
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-brand-700 font-mono text-sm font-semibold">{q.code}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            {tm(`qualificationPhase.${q.phase}`)} ·{" "}
            <Link href={`/metrologia/equipos/${q.equipment.id}`} className="hover:text-brand-800">
              {q.equipment.code} {q.equipment.name}
            </Link>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone={q.result === "PASS" ? "success" : "danger"}>
              {tm(`qualificationResult.${q.result}`)}
            </Badge>
            <span>{tm(`recordStatus.${q.status}`)}</span>
          </div>
        </div>
        <a href={`/api/files/qualification/${q.id}`} className={buttonClass("outline", "md")}>
          <Icon name="download" className="size-4" />
          {tm("qualification.download")}
        </a>
      </div>
      {q.status === "REJECTED" && (
        <Alert tone="warning">
          {tm("calibration.rejected", { reason: q.rejectionReason ?? "" })}
        </Alert>
      )}
      <Section title={tm("qualification.fields.summary")}>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <Detail label={tm("qualification.fields.protocolRef")}>{q.protocolRef}</Detail>
          <Detail label={tm("qualification.fields.executedAt")}>
            {format.dateTime(q.executedAt, { dateStyle: "medium" })}
          </Detail>
          <Detail label={tm("qualification.fields.recordedBy")}>
            {q.recordedBy?.fullName ?? "—"}
          </Detail>
          <div className="sm:col-span-3">
            <Detail label={tm("qualification.fields.summary")}>{q.summary}</Detail>
          </div>
        </dl>
      </Section>
      {q.status === "RECORDED" &&
        (qa && q.recordedById !== ctx.actor.id ? (
          <Section title={tm("qualification.approve.title")}>
            <ActionForm
              id="approve-qualification"
              action={approveQualificationAction}
              hidden={{ id: q.id }}
              signature={`${t("documents.meanings.APPROVED")} / ${t("documents.meanings.REJECTED")}`}
              decisions={[
                { value: "approve", label: tm("qualification.approve.approve") },
                { value: "reject", label: tm("qualification.approve.reject"), variant: "outline" },
              ]}
            >
              <Field
                id="qa-comment"
                label={t("quality.common.comment")}
                help={t("quality.common.commentHelp")}
              >
                <Textarea id="qa-comment" name="comment" maxLength={2000} className="min-h-12" />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{t("quality.deviation.waitingQa")}</Alert>
        ))}
      <Section title={t("quality.common.signatures")}>
        <SignaturesTable signatures={q.signatures} />
      </Section>
      <Link
        href="/metrologia/calificaciones"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
