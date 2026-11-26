import { getTranslations } from "next-intl/server";
import type { Equipment } from "@prisma/client";
import { Field, Input, Select } from "@/components/ui/field";

/** Campos de alta / edición de un equipo. Sin `equipment` incluye el código (solo editable al crear). */
export async function EquipmentFormFields({
  processes,
  users,
  equipment,
  defaultOwnerId,
}: {
  processes: { id: string; code: string; name: string }[];
  users: { id: string; fullName: string }[];
  equipment?: Equipment;
  defaultOwnerId: string;
}) {
  const t = await getTranslations("metrology.equipment");
  const tq = await getTranslations("quality.riskLevel");
  const e = equipment;
  const n = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {!e && (
          <Field id="eq-code" label={t("fields.code")} help={t("codeHelp")}>
            <Input
              id="eq-code"
              name="code"
              required
              className="font-mono uppercase"
              maxLength={40}
              aria-describedby="eq-code-help"
            />
          </Field>
        )}
        <Field id="eq-name" label={t("fields.name")} className={e ? "sm:col-span-2" : undefined}>
          <Input
            id="eq-name"
            name="name"
            required
            minLength={3}
            maxLength={200}
            defaultValue={e?.name}
          />
        </Field>
        <Field id="eq-type" label={t("fields.equipmentType")}>
          <Input
            id="eq-type"
            name="equipmentType"
            required
            minLength={2}
            maxLength={100}
            defaultValue={e?.equipmentType}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="eq-manufacturer" label={t("fields.manufacturer")}>
          <Input
            id="eq-manufacturer"
            name="manufacturer"
            maxLength={100}
            defaultValue={e?.manufacturer ?? ""}
          />
        </Field>
        <Field id="eq-model" label={t("fields.model")}>
          <Input id="eq-model" name="model" maxLength={100} defaultValue={e?.model ?? ""} />
        </Field>
        <Field id="eq-serial" label={t("fields.serialNumber")}>
          <Input
            id="eq-serial"
            name="serialNumber"
            maxLength={100}
            defaultValue={e?.serialNumber ?? ""}
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="eq-location" label={t("fields.location")}>
          <Input
            id="eq-location"
            name="location"
            maxLength={200}
            defaultValue={e?.location ?? ""}
          />
        </Field>
        <Field id="eq-process" label={t("fields.process")}>
          <Select id="eq-process" name="processId" required defaultValue={e?.processId ?? ""}>
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
        <Field id="eq-owner" label={t("fields.owner")}>
          <Select id="eq-owner" name="ownerId" required defaultValue={e?.ownerId ?? defaultOwnerId}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="eq-criticality" label={t("fields.criticality")}>
          <Select id="eq-criticality" name="criticality" defaultValue={e?.criticality ?? "MEDIUM"}>
            {(["LOW", "MEDIUM", "HIGH"] as const).map((r) => (
              <option key={r} value={r}>
                {tq(r)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="eq-range" label={t("fields.measurementRange")}>
          <Input
            id="eq-range"
            name="measurementRange"
            maxLength={100}
            defaultValue={e?.measurementRange ?? ""}
          />
        </Field>
        <Field id="eq-resolution" label={t("fields.resolution")}>
          <Input
            id="eq-resolution"
            name="resolution"
            maxLength={50}
            defaultValue={e?.resolution ?? ""}
          />
        </Field>
        <Field id="eq-unit" label={t("fields.unit")}>
          <Input id="eq-unit" name="unit" maxLength={20} defaultValue={e?.unit ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field id="eq-emp" label={t("fields.maxPermissibleError")} help={t("empHelp")}>
          <Input
            id="eq-emp"
            name="maxPermissibleError"
            inputMode="decimal"
            defaultValue={n(e?.maxPermissibleError)}
            aria-describedby="eq-emp-help"
          />
        </Field>
        <Field id="eq-cal" label={t("fields.calibrationIntervalMonths")}>
          <Input
            id="eq-cal"
            name="calibrationIntervalMonths"
            type="number"
            min={1}
            max={120}
            defaultValue={n(e?.calibrationIntervalMonths)}
          />
        </Field>
        <Field id="eq-ver" label={t("fields.verificationIntervalDays")}>
          <Input
            id="eq-ver"
            name="verificationIntervalDays"
            type="number"
            min={1}
            max={3650}
            defaultValue={n(e?.verificationIntervalDays)}
          />
        </Field>
        <Field id="eq-man" label={t("fields.maintenanceIntervalMonths")}>
          <Input
            id="eq-man"
            name="maintenanceIntervalMonths"
            type="number"
            min={1}
            max={120}
            defaultValue={n(e?.maintenanceIntervalMonths)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="isReferenceStandard"
          defaultChecked={e?.isReferenceStandard}
          className="accent-brand-700"
        />
        {t("fields.isReferenceStandard")}
      </label>
    </>
  );
}
