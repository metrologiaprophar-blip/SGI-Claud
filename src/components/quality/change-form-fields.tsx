import { getTranslations } from "next-intl/server";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const TYPES = [
  "PROCESS",
  "EQUIPMENT",
  "FACILITY",
  "DOCUMENT",
  "SUPPLIER",
  "MATERIAL",
  "COMPUTERIZED_SYSTEM",
  "ANALYTICAL_METHOD",
  "PRODUCT",
  "STORAGE_DISTRIBUTION",
  "OTHER",
] as const;

type Defaults = {
  title?: string;
  description?: string;
  justification?: string;
  changeType?: string;
  processId?: string;
  affectedItems?: string | null;
  plannedDate?: string;
};

/** Campos de la propuesta de cambio (alta y edición del borrador). */
export async function ChangeFormFields({
  processes,
  today,
  defaults = {},
}: {
  processes: { id: string; code: string; name: string }[];
  today: string;
  defaults?: Defaults;
}) {
  const t = await getTranslations("quality.change");
  return (
    <>
      <Field id="ch-title" label={t("fields.title")}>
        <Input
          id="ch-title"
          name="title"
          required
          minLength={3}
          maxLength={200}
          defaultValue={defaults.title}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="ch-type" label={t("fields.changeType")}>
          <Select id="ch-type" name="changeType" required defaultValue={defaults.changeType ?? ""}>
            <option value="" disabled>
              —
            </option>
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`type.${ty}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ch-process" label={t("fields.process")}>
          <Select id="ch-process" name="processId" required defaultValue={defaults.processId ?? ""}>
            <option value="" disabled>
              —
            </option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="ch-planned" label={t("fields.plannedDate")}>
          <Input
            id="ch-planned"
            name="plannedDate"
            type="date"
            min={today}
            defaultValue={defaults.plannedDate}
          />
        </Field>
      </div>
      <Field id="ch-description" label={t("fields.description")}>
        <Textarea
          id="ch-description"
          name="description"
          required
          minLength={10}
          maxLength={4000}
          defaultValue={defaults.description}
        />
      </Field>
      <Field id="ch-justification" label={t("fields.justification")}>
        <Textarea
          id="ch-justification"
          name="justification"
          required
          minLength={10}
          maxLength={4000}
          defaultValue={defaults.justification}
        />
      </Field>
      <Field id="ch-affected" label={t("fields.affectedItems")}>
        <Textarea
          id="ch-affected"
          name="affectedItems"
          maxLength={2000}
          defaultValue={defaults.affectedItems ?? undefined}
          className="min-h-14"
        />
      </Field>
    </>
  );
}
