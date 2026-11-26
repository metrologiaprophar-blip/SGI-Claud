import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { recordQualificationAction } from "@/features/metrology/actions";
import { EquipmentSelect, fileInputClass, type EquipmentOption } from "./equipment-select";

export async function QualificationForm({
  equipment,
  fixed,
  today,
}: {
  equipment: EquipmentOption[];
  fixed?: EquipmentOption;
  today: string;
}) {
  const t = await getTranslations("metrology.qualification");
  const tp = await getTranslations("metrology.qualificationPhase");
  const tr = await getTranslations("metrology.qualificationResult");
  return (
    <ActionForm id="record-qualification" action={recordQualificationAction} submitLabel={t("new")}>
      <EquipmentSelect equipment={equipment} fixed={fixed} />
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="qf-phase" label={t("fields.phase")}>
          <Select id="qf-phase" name="phase" defaultValue="IQ">
            {(["DQ", "IQ", "OQ", "PQ"] as const).map((p) => (
              <option key={p} value={p}>
                {tp(p)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="qf-protocol" label={t("fields.protocolRef")}>
          <Input id="qf-protocol" name="protocolRef" required minLength={2} maxLength={100} />
        </Field>
        <Field id="qf-date" label={t("fields.executedAt")}>
          <Input
            id="qf-date"
            name="executedAt"
            type="date"
            max={today}
            defaultValue={today}
            required
          />
        </Field>
        <Field id="qf-result" label={t("fields.result")}>
          <Select id="qf-result" name="result" defaultValue="PASS">
            <option value="PASS">{tr("PASS")}</option>
            <option value="FAIL">{tr("FAIL")}</option>
          </Select>
        </Field>
      </div>
      <Field id="qf-summary" label={t("fields.summary")}>
        <Textarea id="qf-summary" name="summary" required minLength={10} maxLength={4000} />
      </Field>
      <Field
        id="qf-file"
        label={t("fields.report")}
        help={(await getTranslations("documents.upload"))("help")}
      >
        <input
          id="qf-file"
          name="file"
          type="file"
          required
          accept=".pdf,.docx,.xlsx,.doc,.xls"
          className={fileInputClass}
        />
      </Field>
    </ActionForm>
  );
}
