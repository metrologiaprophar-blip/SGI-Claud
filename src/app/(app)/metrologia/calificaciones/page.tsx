import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ModalButton } from "@/components/forms/modal-button";
import { equipmentOptions } from "@/components/metrology/equipment-options";
import { QualificationForm } from "@/components/metrology/record-forms";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { listQualifications } from "@/features/metrology/records";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("qualifications") };
}

export default async function QualificationsPage() {
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [rows, canManage, options, tz] = await Promise.all([
    listQualifications(ctx.db),
    hasPermission(ctx, "METROLOGY_MANAGE"),
    equipmentOptions(ctx.db),
    orgTimezone(ctx),
  ]);
  return (
    <>
      <PageHeader
        title={t("nav.tools.qualifications")}
        subtitle={t("nav.toolDescriptions.qualifications")}
        actions={
          canManage ? (
            <ModalButton label={tm("qualification.new")} title={tm("qualification.new")}>
              <QualificationForm equipment={options} today={todayInZone(tz)} />
            </ModalButton>
          ) : null
        }
      />
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{tm("qualification.fields.code")}</th>
              <th className="px-4 py-3">{tm("qualification.fields.equipment")}</th>
              <th className="px-4 py-3">{tm("qualification.fields.phase")}</th>
              <th className="px-4 py-3">{tm("qualification.fields.executedAt")}</th>
              <th className="px-4 py-3">{tm("qualification.fields.result")}</th>
              <th className="px-4 py-3">{tm("qualification.fields.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {tm("qualification.empty")}
                </td>
              </tr>
            )}
            {rows.map((q) => (
              <tr key={q.id}>
                <td className="px-4 py-3 font-mono font-semibold">
                  <Link
                    href={`/metrologia/calificaciones/${q.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {q.code}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono">{q.equipment.code}</span> {q.equipment.name}
                </td>
                <td className="px-4 py-3">{tm(`qualificationPhase.${q.phase}`)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {format.dateTime(q.executedAt, { dateStyle: "medium" })}
                </td>
                <td className="px-4 py-3">
                  <Badge tone={q.result === "PASS" ? "success" : "danger"}>
                    {tm(`qualificationResult.${q.result}`)}
                  </Badge>
                </td>
                <td className="px-4 py-3">{tm(`recordStatus.${q.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
