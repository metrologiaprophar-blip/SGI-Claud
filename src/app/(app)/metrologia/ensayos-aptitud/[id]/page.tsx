import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { CapaFormFields } from "@/components/quality/capa-form-fields";
import { StatusBadge } from "@/components/quality/status-badge";
import { Detail, Section } from "@/components/quality/stepper";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createCapaAction } from "@/features/capa/actions";
import { listAssignableUsers } from "@/features/documents/service";
import { getProficiency } from "@/features/metrology/records";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const p = await ctx.db.proficiencyTest.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: p?.code };
}

const OUTCOME_TONE = {
  SATISFACTORY: "success",
  QUESTIONABLE: "warning",
  UNSATISFACTORY: "danger",
} as const;

export default async function ProficiencyDetailPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const p = await getProficiency(ctx.db, id);
  if (!p) notFound();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [qa, users, tz] = await Promise.all([
    hasPermission(ctx, "QA_APPROVE"),
    listAssignableUsers(ctx.db),
    orgTimezone(ctx),
  ]);
  const v = (n: number | null) => (n === null ? "—" : String(n));
  return (
    <div className="space-y-6">
      <div>
        <p className="text-brand-700 font-mono text-sm font-semibold">{p.code}</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">
          {p.measurand} · {p.provider}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <Badge tone={OUTCOME_TONE[p.outcome]}>{tm(`proficiencyOutcome.${p.outcome}`)}</Badge>
          <span className="font-mono">z = {p.zScore}</span>
        </div>
      </div>
      {p.outcome === "UNSATISFACTORY" && p.capas.length === 0 && (
        <Alert tone="error">{tm("proficiency.capaRequired")}</Alert>
      )}
      <Section title={tm("proficiency.fields.outcome")}>
        <p className="mb-3 text-xs text-slate-500">{tm("proficiency.rule")}</p>
        <dl className="grid gap-4 text-sm sm:grid-cols-4">
          <Detail label={tm("proficiency.fields.scheme")}>
            {p.scheme} · {p.round}
          </Detail>
          <Detail label={tm("proficiency.fields.reportDate")}>
            {format.dateTime(p.reportDate, { dateStyle: "medium" })}
          </Detail>
          <Detail label={tm("proficiency.fields.equipment")}>
            {p.equipment ? (
              <Link
                href={`/metrologia/equipos/${p.equipment.id}`}
                className="text-brand-700 hover:underline"
              >
                {p.equipment.code} {p.equipment.name}
              </Link>
            ) : (
              "—"
            )}
          </Detail>
          <Detail label={tm("proficiency.fields.zScore")}>{p.zScore}</Detail>
          <Detail label={tm("proficiency.fields.reportedValue")}>{v(p.reportedValue)}</Detail>
          <Detail label={tm("proficiency.fields.assignedValue")}>{v(p.assignedValue)}</Detail>
          <Detail label={tm("proficiency.fields.sigma")}>{v(p.sigma)}</Detail>
          {p.comments && <Detail label={tm("proficiency.fields.comments")}>{p.comments}</Detail>}
        </dl>
      </Section>
      <Section
        title={tm("proficiency.linkedCapas")}
        actions={
          qa && p.outcome !== "SATISFACTORY" ? (
            <ModalButton
              label={tm("proficiency.createCapa")}
              title={tm("proficiency.createCapa")}
              size="sm"
              variant="secondary"
            >
              <ActionForm
                id="proficiency-capa"
                action={createCapaAction}
                submitLabel={t("quality.capa.new")}
              >
                <input type="hidden" name="source" value="PROFICIENCY" />
                <input type="hidden" name="sourceReference" value={p.code} />
                <CapaFormFields
                  users={users}
                  today={todayInZone(tz)}
                  fixedSource
                  defaults={{
                    title: `${p.code}: ${p.measurand} z = ${p.zScore}`,
                    problemStatement: `${tm(`proficiencyOutcome.${p.outcome}`)}: z = ${p.zScore} (${p.provider}, ${p.scheme}, ${p.round}).`,
                  }}
                />
              </ActionForm>
            </ModalButton>
          ) : null
        }
      >
        {p.capas.length === 0 ? (
          <p className="text-sm text-slate-500">{t("common.none")}</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {p.capas.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/calidad/capa/${c.id}`} className="hover:text-brand-800">
                  <span className="text-brand-700 font-mono font-semibold">{c.code}</span> ·{" "}
                  {c.title}
                </Link>
                <StatusBadge value={c.status} label={t(`quality.capa.status.${c.status}`)} />
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Link
        href="/metrologia/ensayos-aptitud"
        className="text-brand-700 inline-flex text-sm font-semibold hover:underline"
      >
        ← {t("quality.common.back")}
      </Link>
    </div>
  );
}
