import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ModalButton } from "@/components/forms/modal-button";
import { equipmentOptions } from "@/components/metrology/equipment-options";
import { ProficiencyForm } from "@/components/metrology/record-forms";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { listProficiency } from "@/features/metrology/records";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

const OUTCOME_TONE = {
  SATISFACTORY: "success",
  QUESTIONABLE: "warning",
  UNSATISFACTORY: "danger",
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("proficiency") };
}

export default async function ProficiencyPage() {
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [rows, canManage, options, tz] = await Promise.all([
    listProficiency(ctx.db),
    hasPermission(ctx, "METROLOGY_MANAGE"),
    equipmentOptions(ctx.db),
    orgTimezone(ctx),
  ]);
  return (
    <>
      <PageHeader
        title={t("nav.tools.proficiency")}
        subtitle={t("nav.toolDescriptions.proficiency")}
        actions={
          canManage ? (
            <ModalButton
              label={tm("proficiency.new")}
              title={tm("proficiency.new")}
              testId="new-proficiency"
            >
              <ProficiencyForm equipment={options} today={todayInZone(tz)} />
            </ModalButton>
          ) : null
        }
      />
      <p className="mb-3 text-xs text-slate-500">{tm("proficiency.rule")}</p>
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{tm("proficiency.fields.code")}</th>
              <th className="px-4 py-3">{tm("proficiency.fields.provider")}</th>
              <th className="px-4 py-3">{tm("proficiency.fields.measurand")}</th>
              <th className="px-4 py-3">{tm("proficiency.fields.reportDate")}</th>
              <th className="px-4 py-3">{tm("proficiency.fields.zScore")}</th>
              <th className="px-4 py-3">{tm("proficiency.fields.outcome")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {tm("proficiency.empty")}
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td className="px-4 py-3 font-mono font-semibold">
                  <Link
                    href={`/metrologia/ensayos-aptitud/${p.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {p.code}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  {p.provider} · {p.scheme} · {p.round}
                </td>
                <td className="px-4 py-3">{p.measurand}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {format.dateTime(p.reportDate, { dateStyle: "medium" })}
                </td>
                <td className="px-4 py-3 font-mono">{p.zScore}</td>
                <td className="px-4 py-3">
                  <Badge tone={OUTCOME_TONE[p.outcome]}>
                    {tm(`proficiencyOutcome.${p.outcome}`)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
