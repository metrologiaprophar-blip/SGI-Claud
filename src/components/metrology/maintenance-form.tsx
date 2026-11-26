import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { recordMaintenanceAction } from "@/features/metrology/actions";
import { EquipmentSelect, type EquipmentOption } from "./equipment-select";

export async function MaintenanceForm({
  equipment,
  fixed,
  today,
}: {
  equipment: EquipmentOption[];
  fixed?: EquipmentOption;
  today: string;
}) {
  const t = await getTranslations("metrology.maintenance");
  const tt = await getTranslations("metrology.maintenanceType");
  return (
    <ActionForm id="record-maintenance" action={recordMaintenanceAction} submitLabel={t("new")}>
      <EquipmentSelect equipment={equipment} fixed={fixed} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="mf-type" label={t("fields.type")}>
          <Select id="mf-type" name="type" defaultValue="PREVENTIVE">
            <option value="PREVENTIVE">{tt("PREVENTIVE")}</option>
            <option value="CORRECTIVE">{tt("CORRECTIVE")}</option>
          </Select>
        </Field>
        <Field id="mf-date" label={t("fields.performedAt")}>
          <Input
            id="mf-date"
            name="performedAt"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        <Field id="mf-by" label={t("fields.performedBy")}>
          <Input id="mf-by" name="performedBy" required minLength={2} maxLength={200} />
        </Field>
      </div>
      <Field id="mf-description" label={t("fields.description")}>
        <Textarea id="mf-description" name="description" required minLength={5} maxLength={4000} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="requiresRecalibration" className="accent-brand-700" />
        {t("fields.requiresRecalibration")}
      </label>
    </ActionForm>
  );
}
