import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { ModalButton } from "@/components/forms/modal-button";
import { equipmentOptions } from "@/components/metrology/equipment-options";
import { MaintenanceForm } from "@/components/metrology/record-forms";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { listMaintenance } from "@/features/metrology/records";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("maintenance") };
}

export default async function MaintenancePage() {
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [rows, canManage, options, tz] = await Promise.all([
    listMaintenance(ctx.db),
    hasPermission(ctx, "METROLOGY_MANAGE"),
    equipmentOptions(ctx.db),
    orgTimezone(ctx),
  ]);
  return (
    <>
      <PageHeader
        title={t("nav.tools.maintenance")}
        subtitle={t("nav.toolDescriptions.maintenance")}
        actions={
          canManage ? (
            <ModalButton label={tm("maintenance.new")} title={tm("maintenance.new")}>
              <MaintenanceForm equipment={options} today={todayInZone(tz)} />
            </ModalButton>
          ) : null
        }
      />
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{tm("maintenance.fields.performedAt")}</th>
              <th className="px-4 py-3">{tm("maintenance.fields.equipment")}</th>
              <th className="px-4 py-3">{tm("maintenance.fields.type")}</th>
              <th className="px-4 py-3">{tm("maintenance.fields.description")}</th>
              <th className="px-4 py-3">{tm("maintenance.fields.performedBy")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {tm("maintenance.empty")}
                </td>
              </tr>
            )}
            {rows.map((m) => (
              <tr key={m.id} className="align-top">
                <td className="px-4 py-3 whitespace-nowrap">
                  {format.dateTime(m.performedAt, { dateStyle: "medium" })}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/metrologia/equipos/${m.equipment.id}`}
                    className="text-brand-700 font-mono hover:underline"
                  >
                    {m.equipment.code}
                  </Link>{" "}
                  {m.equipment.name}
                </td>
                <td className="px-4 py-3">
                  {tm(`maintenanceType.${m.type}`)}
                  {m.requiresRecalibration && (
                    <Badge tone="warning" className="ml-2">
                      {tm("maintenance.fields.requiresRecalibration")}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{m.description}</td>
                <td className="px-4 py-3">{m.performedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
