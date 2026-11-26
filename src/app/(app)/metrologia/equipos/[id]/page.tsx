import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { DueBadge } from "@/components/metrology/due-badge";
import { EquipmentFormFields } from "@/components/metrology/equipment-form-fields";
import {
  CalibrationForm,
  MaintenanceForm,
  QualificationForm,
  VerificationForm,
} from "@/components/metrology/record-forms";
import { SignaturesTable } from "@/components/quality/signatures-table";
import { StatusBadge } from "@/components/quality/status-badge";
import { Detail, Section } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Textarea } from "@/components/ui/field";
import { listAssignableUsers, listProcesses } from "@/features/documents/service";
import {
  outOfServiceAction,
  retireEquipmentAction,
  returnToServiceAction,
  updateEquipmentAction,
} from "@/features/metrology/actions";
import { getEquipment, listEquipment } from "@/features/metrology/equipment";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { permissionsOf } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const e = await ctx.db.equipment.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: e?.code };
}

const STATUS_TONE = {
  IN_SERVICE: "success",
  OUT_OF_SERVICE: "danger",
  RETIRED: "neutral",
} as const;
const RESULT_VALUE = { CONFORM: "CLOSED", ADJUSTED: "APPROVED", NON_CONFORM: "REJECTED" } as const;

export default async function EquipmentDetailPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const e = await getEquipment(ctx.db, id);
  if (!e) notFound();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [perms, processes, users, standards, tz] = await Promise.all([
    permissionsOf(ctx.db, ctx.actor.id),
    listProcesses(ctx.db),
    listAssignableUsers(ctx.db),
    listEquipment(ctx.db, { referenceOnly: true }),
    orgTimezone(ctx),
  ]);
  const canManage = perms.includes("METROLOGY_MANAGE");
  const canApprove = perms.includes("METROLOGY_APPROVE");
  const today = todayInZone(tz);
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");
  const active = e.status !== "RETIRED";
  const fixed = { id: e.id, code: e.code, name: e.name };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-brand-700 font-mono text-sm font-semibold">{e.code}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{e.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone={STATUS_TONE[e.status]}>{tm(`equipmentStatus.${e.status}`)}</Badge>
            {e.isReferenceStandard && (
              <Badge tone="brand">{tm("equipment.fields.isReferenceStandard")}</Badge>
            )}
            <span>
              {e.equipmentType} · {e.process.code} · {e.owner.fullName}
            </span>
          </div>
        </div>
        {active && (
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <>
                <ModalButton
                  label={tm("calibration.new")}
                  title={`${tm("calibration.new")} · ${e.code}`}
                  testId="new-calibration"
                >
                  <CalibrationForm equipment={e} standards={standards} today={today} />
                </ModalButton>
                <ModalButton
                  label={tm("verification.new")}
                  title={`${tm("verification.new")} · ${e.code}`}
                  variant="secondary"
                >
                  <VerificationForm equipment={[]} fixed={fixed} today={today} />
                </ModalButton>
                <ModalButton
                  label={tm("maintenance.new")}
                  title={`${tm("maintenance.new")} · ${e.code}`}
                  variant="secondary"
                >
                  <MaintenanceForm equipment={[]} fixed={fixed} today={today} />
                </ModalButton>
                <ModalButton
                  label={tm("qualification.new")}
                  title={`${tm("qualification.new")} · ${e.code}`}
                  variant="secondary"
                >
                  <QualificationForm equipment={[]} fixed={fixed} today={today} />
                </ModalButton>
              </>
            )}
          </div>
        )}
      </div>

      {e.status === "OUT_OF_SERVICE" && (
        <Alert tone="error">
          {tm("equipment.outOfServiceAlert", { reason: e.statusReason ?? "" })}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title={tm("equipment.schedule")}>
          <dl className="space-y-3 text-sm">
            <Detail label={tm("equipment.fields.lastCalibration")}>
              {date(e.lastCalibrationAt)}
            </Detail>
            <Detail label={tm("equipment.fields.nextCalibration")}>
              <DueBadge date={e.nextCalibrationDue} />
            </Detail>
            <Detail label={tm("equipment.fields.nextVerification")}>
              <DueBadge date={e.nextVerificationDue} />
            </Detail>
            <Detail label={tm("equipment.fields.nextMaintenance")}>
              <DueBadge date={e.nextMaintenanceDue} />
            </Detail>
          </dl>
        </Section>
        <Section
          title={tm("equipment.metrologyData")}
          className="xl:col-span-2"
          actions={
            active && canManage ? (
              <ModalButton
                label={tm("equipment.edit")}
                title={tm("equipment.edit")}
                size="sm"
                variant="outline"
              >
                <ActionForm
                  id="edit-equipment"
                  action={updateEquipmentAction}
                  hidden={{ id: e.id }}
                >
                  <EquipmentFormFields
                    processes={processes}
                    users={users}
                    equipment={e}
                    defaultOwnerId={e.ownerId}
                  />
                  <Field
                    id="ee-reason"
                    label={tm("equipment.editReason")}
                    help={t("common.reasonHelp")}
                  >
                    <Textarea
                      id="ee-reason"
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      className="min-h-12"
                    />
                  </Field>
                </ActionForm>
              </ModalButton>
            ) : null
          }
        >
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <Detail label={tm("equipment.fields.manufacturer")}>
              {[e.manufacturer, e.model].filter(Boolean).join(" · ") || "—"}
            </Detail>
            <Detail label={tm("equipment.fields.serialNumber")}>{e.serialNumber ?? "—"}</Detail>
            <Detail label={tm("equipment.fields.location")}>{e.location ?? "—"}</Detail>
            <Detail label={tm("equipment.fields.measurementRange")}>
              {e.measurementRange ?? "—"}
            </Detail>
            <Detail label={tm("equipment.fields.resolution")}>{e.resolution ?? "—"}</Detail>
            <Detail label={tm("equipment.fields.maxPermissibleError")}>
              {e.maxPermissibleError !== null ? `± ${e.maxPermissibleError} ${e.unit ?? ""}` : "—"}
            </Detail>
            <Detail label={tm("equipment.fields.calibrationIntervalMonths")}>
              {e.calibrationIntervalMonths ?? "—"}
            </Detail>
            <Detail label={tm("equipment.fields.verificationIntervalDays")}>
              {e.verificationIntervalDays ?? "—"}
            </Detail>
            <Detail label={tm("equipment.fields.criticality")}>
              {t(`quality.riskLevel.${e.criticality}`)}
            </Detail>
          </dl>
        </Section>
      </div>

      {/* Calibraciones */}
      <Section title={tm("equipment.history.calibrations")}>
        {e.calibrations.length === 0 ? (
          <p className="text-sm text-slate-500">{tm("calibration.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-slate-200 text-sm"
              data-testid="equipment-calibrations"
            >
              <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">{tm("calibration.fields.code")}</th>
                  <th className="py-2 pr-4">{tm("calibration.fields.calibratedAt")}</th>
                  <th className="py-2 pr-4">{tm("calibration.fields.kind")}</th>
                  <th className="py-2 pr-4">{tm("calibration.fields.certificateNumber")}</th>
                  <th className="py-2 pr-4">{tm("calibration.fields.result")}</th>
                  <th className="py-2">{tm("calibration.fields.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {e.calibrations.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-4 font-mono font-semibold">
                      <Link
                        href={`/metrologia/calibraciones/${c.id}`}
                        className="text-brand-700 hover:underline"
                      >
                        {c.code}
                      </Link>
                    </td>
                    <td className="py-2 pr-4 whitespace-nowrap">{date(c.calibratedAt)}</td>
                    <td className="py-2 pr-4">{tm(`calibrationKind.${c.kind}`)}</td>
                    <td className="py-2 pr-4">{c.certificateNumber ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <StatusBadge
                        value={RESULT_VALUE[c.result]}
                        label={tm(`calibrationResult.${c.result}`)}
                      />
                    </td>
                    <td className="py-2">{tm(`recordStatus.${c.status}`)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title={tm("equipment.history.verifications")}>
          {e.verifications.length === 0 ? (
            <p className="text-sm text-slate-500">{tm("verification.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {e.verifications.map((v) => (
                <li key={v.id} className="flex items-start justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{date(v.performedAt)}</span> · {v.method}
                    <span className="block text-xs text-slate-500">{v.readings}</span>
                  </span>
                  <Badge tone={v.result === "CONFORM" ? "success" : "danger"}>
                    {tm(`verificationResult.${v.result}`)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={tm("equipment.history.maintenance")}>
          {e.maintenances.length === 0 ? (
            <p className="text-sm text-slate-500">{tm("maintenance.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {e.maintenances.map((m) => (
                <li key={m.id} className="py-2">
                  <span className="font-medium">{date(m.performedAt)}</span> ·{" "}
                  {tm(`maintenanceType.${m.type}`)} · {m.performedBy}
                  <span className="block text-xs text-slate-500">{m.description}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={tm("equipment.history.qualifications")}>
          {e.qualifications.length === 0 ? (
            <p className="text-sm text-slate-500">{tm("qualification.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {e.qualifications.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/metrologia/calificaciones/${q.id}`}
                    className="hover:text-brand-800"
                  >
                    <span className="text-brand-700 font-mono font-semibold">{q.code}</span> ·{" "}
                    {tm(`qualificationPhase.${q.phase}`)} · {date(q.executedAt)}
                  </Link>
                  <span className="text-xs text-slate-500">{tm(`recordStatus.${q.status}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title={tm("equipment.history.proficiency")}>
          {e.proficiency.length === 0 ? (
            <p className="text-sm text-slate-500">{tm("proficiency.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {e.proficiency.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                  <Link
                    href={`/metrologia/ensayos-aptitud/${p.id}`}
                    className="hover:text-brand-800"
                  >
                    <span className="text-brand-700 font-mono font-semibold">{p.code}</span> ·{" "}
                    {p.measurand} · z = {p.zScore}
                  </Link>
                  <span className="text-xs">{tm(`proficiencyOutcome.${p.outcome}`)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {active && (canManage || canApprove) && (
        <Section title={tm("equipment.fields.status")}>
          <div className="flex flex-wrap gap-2">
            {e.status === "IN_SERVICE" && canManage && (
              <ModalButton
                label={tm("equipment.outOfService")}
                title={tm("equipment.outOfService")}
                variant="outline"
              >
                <ActionForm
                  id="out-of-service"
                  action={outOfServiceAction}
                  hidden={{ id: e.id }}
                  submitLabel={tm("equipment.outOfService")}
                >
                  <Field id="os-reason" label={t("quality.common.reason")}>
                    <Textarea id="os-reason" name="reason" required minLength={5} maxLength={500} />
                  </Field>
                </ActionForm>
              </ModalButton>
            )}
            {e.status === "OUT_OF_SERVICE" && canApprove && (
              <ModalButton
                label={tm("equipment.returnToService")}
                title={tm("equipment.returnToService")}
              >
                <ActionForm
                  id="return-to-service"
                  action={returnToServiceAction}
                  hidden={{ id: e.id }}
                  submitLabel={tm("equipment.returnToService")}
                  signature={t("documents.meanings.APPROVED")}
                >
                  <p className="text-sm text-slate-600">{tm("equipment.returnHelp")}</p>
                  <Field id="rs-reason" label={t("quality.common.reason")}>
                    <Textarea id="rs-reason" name="reason" required minLength={5} maxLength={500} />
                  </Field>
                </ActionForm>
              </ModalButton>
            )}
            {canApprove && (
              <ModalButton
                label={tm("equipment.retire")}
                title={tm("equipment.retire")}
                variant="ghost"
              >
                <ActionForm
                  id="retire"
                  action={retireEquipmentAction}
                  hidden={{ id: e.id }}
                  submitLabel={tm("equipment.retire")}
                  signature={t("documents.meanings.OBSOLETED")}
                >
                  <p className="text-sm text-slate-600">{tm("equipment.retireHelp")}</p>
                  <Field id="rt-reason" label={t("quality.common.reason")}>
                    <Textarea id="rt-reason" name="reason" required minLength={5} maxLength={500} />
                  </Field>
                </ActionForm>
              </ModalButton>
            )}
          </div>
        </Section>
      )}

      {e.signatures.length > 0 && (
        <Section title={t("quality.common.signatures")}>
          <SignaturesTable signatures={e.signatures} />
        </Section>
      )}

      <Link
        href="/metrologia/equipos"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
