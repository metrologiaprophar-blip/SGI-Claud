import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ModalButton } from "@/components/forms/modal-button";
import { equipmentOptions } from "@/components/metrology/equipment-options";
import { VerificationForm } from "@/components/metrology/record-forms";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { listVerifications } from "@/features/metrology/records";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("verifications") };
}

export default async function VerificationsPage() {
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [rows, canManage, options, tz] = await Promise.all([
    listVerifications(ctx.db),
    hasPermission(ctx, "METROLOGY_MANAGE"),
    equipmentOptions(ctx.db),
    orgTimezone(ctx),
  ]);
  return (
    <>
      <PageHeader
        title={t("nav.tools.verifications")}
        subtitle={t("nav.toolDescriptions.verifications")}
        actions={
          canManage ? (
            <ModalButton label={tm("verification.new")} title={tm("verification.new")}>
              <VerificationForm equipment={options} today={todayInZone(tz)} />
            </ModalButton>
          ) : null
        }
      />
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{tm("verification.fields.performedAt")}</th>
              <th className="px-4 py-3">{tm("verification.fields.equipment")}</th>
              <th className="px-4 py-3">{tm("verification.fields.method")}</th>
              <th className="px-4 py-3">{tm("verification.fields.readings")}</th>
              <th className="px-4 py-3">{tm("verification.fields.result")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {tm("verification.empty")}
                </td>
              </tr>
            )}
            {rows.map((v) => (
              <tr key={v.id} className="align-top">
                <td className="px-4 py-3 whitespace-nowrap">
                  {format.dateTime(v.performedAt, { dateStyle: "medium" })}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/metrologia/equipos/${v.equipment.id}`}
                    className="text-brand-700 font-mono hover:underline"
                  >
                    {v.equipment.code}
                  </Link>{" "}
                  {v.equipment.name}
                </td>
                <td className="px-4 py-3">{v.method}</td>
                <td className="px-4 py-3 text-slate-600">{v.readings}</td>
                <td className="px-4 py-3">
                  <Badge tone={v.result === "CONFORM" ? "success" : "danger"}>
                    {tm(`verificationResult.${v.result}`)}
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
