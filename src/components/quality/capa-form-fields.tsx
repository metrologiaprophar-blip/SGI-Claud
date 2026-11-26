import { getTranslations } from "next-intl/server";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const SOURCES = [
  "AUDIT",
  "COMPLAINT",
  "CHANGE_CONTROL",
  "MANAGEMENT_REVIEW",
  "RISK",
  "OOS",
  "INSPECTION",
  "OTHER",
] as const;
const TYPES = ["CORRECTIVE", "PREVENTIVE", "BOTH"] as const;

/** Campos del alta de una CAPA. Con `deviation`, el origen queda fijado a esa desviación. */
export async function CapaFormFields({
  users,
  today,
  deviation,
  fixedSource,
  defaultOwnerId,
  defaults,
}: {
  users: { id: string; fullName: string }[];
  today: string;
  deviation?: { id: string; code: string };
  /** El formulario ya fija el origen con campos ocultos (p. ej. ensayo de aptitud). */
  fixedSource?: boolean;
  defaultOwnerId?: string;
  defaults?: { title?: string; problemStatement?: string; rootCause?: string | null };
}) {
  const t = await getTranslations("quality.capa");
  return (
    <>
      {deviation ? (
        <>
          <input type="hidden" name="source" value="DEVIATION" />
          <input type="hidden" name="deviationId" value={deviation.id} />
          <p className="text-sm text-slate-600">{t("fromDeviation", { code: deviation.code })}</p>
        </>
      ) : fixedSource ? null : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="nc-source" label={t("fields.source")}>
            <Select id="nc-source" name="source" required defaultValue="">
              <option value="" disabled>
                —
              </option>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {t(`source.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="nc-ref" label={t("fields.sourceReference")}>
            <Input id="nc-ref" name="sourceReference" maxLength={100} />
          </Field>
        </div>
      )}
      <Field id="nc-title" label={t("fields.title")}>
        <Input
          id="nc-title"
          name="title"
          required
          minLength={3}
          maxLength={200}
          defaultValue={defaults?.title}
        />
      </Field>
      <Field id="nc-problem" label={t("fields.problemStatement")}>
        <Textarea
          id="nc-problem"
          name="problemStatement"
          required
          minLength={10}
          maxLength={4000}
          defaultValue={defaults?.problemStatement}
        />
      </Field>
      <Field id="nc-root" label={t("fields.rootCause")}>
        <Textarea
          id="nc-root"
          name="rootCause"
          maxLength={4000}
          defaultValue={defaults?.rootCause ?? undefined}
          className="min-h-14"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="nc-type" label={t("fields.type")}>
          <Select id="nc-type" name="type" required defaultValue="CORRECTIVE">
            {TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {t(`type.${ty}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="nc-owner" label={t("fields.owner")}>
          <Select id="nc-owner" name="ownerId" required defaultValue={defaultOwnerId ?? ""}>
            <option value="" disabled>
              —
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="nc-target" label={t("fields.targetDate")}>
          <Input id="nc-target" name="targetDate" type="date" min={today} required />
        </Field>
      </div>
      <Field id="nc-criteria" label={t("fields.effectivenessCriteria")}>
        <Textarea
          id="nc-criteria"
          name="effectivenessCriteria"
          required
          minLength={5}
          maxLength={2000}
          className="min-h-14"
        />
      </Field>
    </>
  );
}
