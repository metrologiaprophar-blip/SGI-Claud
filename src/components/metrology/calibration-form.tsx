import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import type { Equipment } from "@prisma/client";
import { recordCalibrationAction } from "@/features/metrology/actions";
import { CalibrationPointsField } from "./calibration-points-field";
import { fileInputClass } from "./equipment-select";

/** Registro de calibración de un equipo concreto (necesita su EMP para el cálculo en vivo). */
export async function CalibrationForm({
  equipment,
  standards,
  today,
}: {
  equipment: Equipment;
  standards: Equipment[];
  today: string;
}) {
  const t = await getTranslations("metrology.calibration");
  const tr = await getTranslations("metrology.calibrationResult");
  const usable = standards.filter((s) => s.id !== equipment.id);
  return (
    <ActionForm
      id="record-calibration"
      action={recordCalibrationAction}
      hidden={{ equipmentId: equipment.id }}
      submitLabel={t("new")}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="cf-kind" label={t("fields.kind")} help={t("externalHelp")}>
          <Select id="cf-kind" name="kind" defaultValue="EXTERNAL">
            <option value="EXTERNAL">
              {(await getTranslations("metrology.calibrationKind"))("EXTERNAL")}
            </option>
            <option value="INTERNAL">
              {(await getTranslations("metrology.calibrationKind"))("INTERNAL")}
            </option>
          </Select>
        </Field>
        <Field id="cf-date" label={t("fields.calibratedAt")}>
          <Input
            id="cf-date"
            name="calibratedAt"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        <Field id="cf-cert" label={t("fields.certificateNumber")}>
          <Input id="cf-cert" name="certificateNumber" maxLength={100} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cf-provider" label={t("fields.provider")}>
          <Input id="cf-provider" name="provider" maxLength={200} />
        </Field>
        <Field id="cf-accreditation" label={t("fields.accreditation")}>
          <Input id="cf-accreditation" name="accreditation" maxLength={100} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium text-slate-700">{t("fields.standards")}</legend>
        <p className="mb-2 text-xs text-slate-500">{t("standardsHelp")}</p>
        {usable.length === 0 ? (
          <p className="text-xs text-slate-400">—</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {usable.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  name="referenceStandardIds"
                  value={s.id}
                  className="accent-brand-700"
                />
                <span className="font-mono">{s.code}</span> {s.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <CalibrationPointsField emp={equipment.maxPermissibleError} unit={equipment.unit} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="cf-declared" label={t("fields.declaredResult")} help={t("declaredHelp")}>
          <Select id="cf-declared" name="declaredResult" defaultValue="">
            <option value="">—</option>
            {(["CONFORM", "ADJUSTED", "NON_CONFORM"] as const).map((r) => (
              <option key={r} value={r}>
                {tr(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="cf-file"
          label={t("fields.certificate")}
          help={(await getTranslations("documents.upload"))("help")}
        >
          <input
            id="cf-file"
            name="file"
            type="file"
            accept=".pdf,.docx,.xlsx,.doc,.xls"
            className={fileInputClass}
          />
        </Field>
      </div>
      <Field id="cf-impact" label={t("fields.impactAssessment")} help={t("impactHelp")}>
        <Textarea id="cf-impact" name="impactAssessment" maxLength={4000} className="min-h-14" />
      </Field>
      <Field id="cf-comments" label={t("fields.comments")}>
        <Textarea id="cf-comments" name="comments" maxLength={2000} className="min-h-12" />
      </Field>
    </ActionForm>
  );
}
