import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { SignaturesTable } from "@/components/quality/signatures-table";
import { StatusBadge } from "@/components/quality/status-badge";
import { Detail, Section } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { approveCalibrationAction, openDeviationAction } from "@/features/metrology/actions";
import { getCalibration } from "@/features/metrology/calibrations";
import type { EvaluatedPoint } from "@/features/metrology/rules";
import { getServiceContext } from "@/server/action";
import { permissionsOf } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const c = await ctx.db.calibration.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: c?.code };
}

const RESULT_VALUE = { CONFORM: "CLOSED", ADJUSTED: "APPROVED", NON_CONFORM: "REJECTED" } as const;

export default async function CalibrationPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const c = await getCalibration(ctx.db, id);
  if (!c) notFound();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const perms = await permissionsOf(ctx.db, ctx.actor.id);
  const me = ctx.actor.id;
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");
  const points = (Array.isArray(c.points) ? c.points : []) as unknown as EvaluatedPoint[];
  const canOpenDeviation =
    c.result === "NON_CONFORM" &&
    !c.deviationId &&
    (c.recordedById === me || perms.includes("METROLOGY_APPROVE") || perms.includes("QA_APPROVE"));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-brand-700 font-mono text-sm font-semibold">{c.code}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">
            <Link href={`/metrologia/equipos/${c.equipment.id}`} className="hover:text-brand-800">
              {c.equipment.code} · {c.equipment.name}
            </Link>
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <StatusBadge
              value={RESULT_VALUE[c.result]}
              label={tm(`calibrationResult.${c.result}`)}
            />
            <span>{tm(`recordStatus.${c.status}`)}</span>
            <span>
              · {tm(`calibrationKind.${c.kind}`)} · {date(c.calibratedAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.storageKey && (
            <a href={`/api/files/calibration/${c.id}`} className={buttonClass("outline", "md")}>
              <Icon name="download" className="size-4" />
              {tm("calibration.download")}
            </a>
          )}
          {canOpenDeviation && (
            <ActionForm
              id="open-deviation"
              action={openDeviationAction}
              hidden={{ id: c.id }}
              submitLabel={tm("calibration.openDeviation")}
              className=""
            />
          )}
        </div>
      </div>

      {c.result === "NON_CONFORM" && (
        <Alert tone="error">{tm("calibration.nonConformAlert")}</Alert>
      )}
      {c.status === "REJECTED" && (
        <Alert tone="warning">
          {tm("calibration.rejected", { reason: c.rejectionReason ?? "" })}
        </Alert>
      )}
      {c.deviation && (
        <Alert tone="info">
          {tm("calibration.deviationLinked")}:{" "}
          <Link
            href={`/calidad/desviaciones/${c.deviation.id}`}
            className="text-brand-700 font-mono font-semibold hover:underline"
          >
            {c.deviation.code}
          </Link>{" "}
          · {t(`quality.deviation.status.${c.deviation.status}`)}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title={tm("calibration.points.title")} className="xl:col-span-2">
          <p className="mb-3 text-xs text-slate-500">
            {c.equipment.maxPermissibleError !== null
              ? tm("calibration.points.rule", {
                  emp: c.equipment.maxPermissibleError,
                  unit: c.unit ?? "",
                })
              : tm("calibration.points.noEmp")}
          </p>
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-slate-200 text-sm"
              data-testid="calibration-points"
            >
              <thead className="text-left text-xs font-semibold text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">{tm("calibration.points.nominal")}</th>
                  <th className="py-2 pr-4">{tm("calibration.points.reading")}</th>
                  <th className="py-2 pr-4">{tm("calibration.points.error")}</th>
                  <th className="py-2 pr-4">{tm("calibration.points.uncertainty")}</th>
                  <th className="py-2">{tm("calibration.points.conform")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {points.map((p, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-4">{p.nominal}</td>
                    <td className="py-2 pr-4">{p.reading}</td>
                    <td className="py-2 pr-4">{p.error}</td>
                    <td className="py-2 pr-4">{p.uncertainty}</td>
                    <td className="py-2 font-sans">
                      {p.conform === true && (
                        <span className="font-semibold text-emerald-700">
                          {tm("calibration.points.yes")}
                        </span>
                      )}
                      {p.conform === false && (
                        <span className="font-semibold text-red-700">
                          {tm("calibration.points.no")}
                        </span>
                      )}
                      {p.conform === null && "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {c.computedResult && (
            <p className="mt-3 text-sm text-slate-600">
              {tm("calibration.fields.computed")}:{" "}
              <strong>{tm(`calibrationResult.${c.computedResult}`)}</strong>
            </p>
          )}
        </Section>
        <Section title={tm("calibration.traceability")}>
          <dl className="space-y-3 text-sm">
            {c.kind === "EXTERNAL" ? (
              <>
                <Detail label={tm("calibration.fields.provider")}>{c.provider ?? "—"}</Detail>
                <Detail label={tm("calibration.fields.accreditation")}>
                  {c.accreditation ?? "—"}
                </Detail>
                <Detail label={tm("calibration.fields.certificateNumber")}>
                  {c.certificateNumber ?? "—"}
                </Detail>
              </>
            ) : (
              <Detail label={tm("calibration.fields.standards")}>
                {c.standards.map((s) => (
                  <Link
                    key={s.id}
                    href={`/metrologia/equipos/${s.id}`}
                    className="text-brand-700 block hover:underline"
                  >
                    {s.code} · {s.name}
                  </Link>
                ))}
              </Detail>
            )}
            <Detail label={tm("calibration.fields.recordedBy")}>
              {c.recordedBy?.fullName ?? "—"}
            </Detail>
            {c.approvedBy && (
              <Detail label={tm("calibration.fields.approvedBy")}>{c.approvedBy.fullName}</Detail>
            )}
          </dl>
        </Section>
      </div>

      {(c.impactAssessment || c.comments) && (
        <Section title={tm("calibration.fields.comments")}>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {c.impactAssessment && (
              <Detail label={tm("calibration.fields.impactAssessment")}>
                {c.impactAssessment}
              </Detail>
            )}
            {c.comments && <Detail label={tm("calibration.fields.comments")}>{c.comments}</Detail>}
          </dl>
        </Section>
      )}

      {c.status === "RECORDED" &&
        (perms.includes("METROLOGY_APPROVE") && c.recordedById !== me ? (
          <Section title={tm("calibration.approve.title")}>
            <ActionForm
              id="approve-calibration"
              action={approveCalibrationAction}
              hidden={{ id: c.id }}
              signature={`${t("documents.meanings.APPROVED")} / ${t("documents.meanings.REJECTED")}`}
              decisions={[
                { value: "approve", label: tm("calibration.approve.approve") },
                { value: "reject", label: tm("calibration.approve.reject"), variant: "outline" },
              ]}
            >
              <Field
                id="ca-comment"
                label={t("quality.common.comment")}
                help={t("quality.common.commentHelp")}
              >
                <Textarea id="ca-comment" name="comment" maxLength={2000} className="min-h-12" />
              </Field>
            </ActionForm>
          </Section>
        ) : (
          <Alert tone="info">{tm("recordStatus.RECORDED")}</Alert>
        ))}

      <Section title={t("quality.common.signatures")}>
        <SignaturesTable signatures={c.signatures} />
      </Section>

      <Link
        href="/metrologia/calibraciones"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
