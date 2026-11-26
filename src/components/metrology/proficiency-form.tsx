import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { recordProficiencyAction } from "@/features/metrology/actions";
import type { EquipmentOption } from "./equipment-select";

export async function ProficiencyForm({
  equipment,
  fixed,
  today,
}: {
  equipment: EquipmentOption[];
  fixed?: EquipmentOption;
  today: string;
}) {
  const t = await getTranslations("metrology.proficiency");
  return (
    <ActionForm id="record-proficiency" action={recordProficiencyAction} submitLabel={t("new")}>
      <p className="text-xs text-slate-500">{t("rule")}</p>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="pf-provider" label={t("fields.provider")}>
          <Input id="pf-provider" name="provider" required maxLength={200} />
        </Field>
        <Field id="pf-scheme" label={t("fields.scheme")}>
          <Input id="pf-scheme" name="scheme" required maxLength={200} />
        </Field>
        <Field id="pf-round" label={t("fields.round")}>
          <Input id="pf-round" name="round" required maxLength={50} />
        </Field>
        <Field id="pf-date" label={t("fields.reportDate")}>
          <Input
            id="pf-date"
            name="reportDate"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pf-measurand" label={t("fields.measurand")}>
          <Input id="pf-measurand" name="measurand" required maxLength={200} />
        </Field>
        {fixed ? (
          <input type="hidden" name="equipmentId" value={fixed.id} />
        ) : (
          <Field id="pf-equipment" label={t("fields.equipment")}>
            <Select id="pf-equipment" name="equipmentId" defaultValue="">
              <option value="">—</option>
              {equipment.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code} · {e.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="pf-x" label={t("fields.reportedValue")}>
          <Input id="pf-x" name="reportedValue" inputMode="decimal" />
        </Field>
        <Field id="pf-X" label={t("fields.assignedValue")}>
          <Input id="pf-X" name="assignedValue" inputMode="decimal" />
        </Field>
        <Field id="pf-sigma" label={t("fields.sigma")}>
          <Input id="pf-sigma" name="sigma" inputMode="decimal" />
        </Field>
        <Field id="pf-z" label={t("fields.zScore")} help={t("zHelp")}>
          <Input id="pf-z" name="zScore" inputMode="decimal" aria-describedby="pf-z-help" />
        </Field>
      </div>
      <Field id="pf-comments" label={t("fields.comments")}>
        <Textarea id="pf-comments" name="comments" maxLength={2000} className="min-h-12" />
      </Field>
    </ActionForm>
  );
}
