import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { recordVerificationAction } from "@/features/metrology/actions";
import { EquipmentSelect, type EquipmentOption } from "./equipment-select";

export async function VerificationForm({
  equipment,
  fixed,
  today,
}: {
  equipment: EquipmentOption[];
  fixed?: EquipmentOption;
  today: string;
}) {
  const t = await getTranslations("metrology.verification");
  const tr = await getTranslations("metrology.verificationResult");
  const td = await getTranslations("documents.meanings");
  return (
    <ActionForm
      id="record-verification"
      action={recordVerificationAction}
      submitLabel={t("new")}
      signature={td("AUTHORED")}
    >
      <EquipmentSelect equipment={equipment} fixed={fixed} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="vf-date" label={t("fields.performedAt")}>
          <Input
            id="vf-date"
            name="performedAt"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        <Field id="vf-result" label={t("fields.result")}>
          <Select id="vf-result" name="result" required defaultValue="CONFORM">
            <option value="CONFORM">{tr("CONFORM")}</option>
            <option value="NON_CONFORM">{tr("NON_CONFORM")}</option>
          </Select>
        </Field>
      </div>
      <Field id="vf-method" label={t("fields.method")}>
        <Input id="vf-method" name="method" required minLength={3} maxLength={300} />
      </Field>
      <Field id="vf-readings" label={t("fields.readings")}>
        <Textarea
          id="vf-readings"
          name="readings"
          required
          minLength={3}
          maxLength={2000}
          className="min-h-14"
        />
      </Field>
      <Field id="vf-comments" label={t("fields.comments")}>
        <Textarea id="vf-comments" name="comments" maxLength={2000} className="min-h-12" />
      </Field>
    </ActionForm>
  );
}
