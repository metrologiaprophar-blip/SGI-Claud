import { getTranslations } from "next-intl/server";
import { Field, inputClass, Select } from "@/components/ui/field";

export type EquipmentOption = { id: string; code: string; name: string };

export const fileInputClass = `${inputClass} file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-brand-800`;

/** Selector de equipo (o campo oculto si el formulario ya está fijado a un equipo). */
export async function EquipmentSelect({
  equipment,
  fixed,
}: {
  equipment: EquipmentOption[];
  fixed?: EquipmentOption;
}) {
  const t = await getTranslations("metrology.calibration.fields");
  if (fixed) return <input type="hidden" name="equipmentId" value={fixed.id} />;
  return (
    <Field id="rf-equipment" label={t("equipment")}>
      <Select id="rf-equipment" name="equipmentId" required defaultValue="">
        <option value="" disabled>
          —
        </option>
        {equipment.map((e) => (
          <option key={e.id} value={e.id}>
            {e.code} · {e.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
