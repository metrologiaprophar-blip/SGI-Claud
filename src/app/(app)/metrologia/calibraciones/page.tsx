import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { DueBadge } from "@/components/metrology/due-badge";
import { StatusBadge } from "@/components/quality/status-badge";
import { Card, PageHeader } from "@/components/ui/card";
import { listCalibrations } from "@/features/metrology/calibrations";
import { getServiceContext } from "@/server/action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("calibrations") };
}

const RESULT_VALUE = { CONFORM: "CLOSED", ADJUSTED: "APPROVED", NON_CONFORM: "REJECTED" } as const;

/** Programa de calibración (equipos ordenados por vencimiento) y registros recientes. */
export default async function CalibrationsPage() {
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const tm = await getTranslations("metrology");
  const format = await getFormatter();
  const [program, records] = await Promise.all([
    ctx.db.equipment.findMany({
      where: { status: { not: "RETIRED" }, calibrationIntervalMonths: { not: null } },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        calibrationIntervalMonths: true,
        lastCalibrationAt: true,
        nextCalibrationDue: true,
      },
      orderBy: [{ nextCalibrationDue: "asc" }],
    }),
    listCalibrations(ctx.db),
  ]);
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");

  return (
    <>
      <PageHeader
        title={t("nav.tools.calibrations")}
        subtitle={t("nav.toolDescriptions.calibrations")}
      />
      <h2 className="mb-3 text-lg font-semibold text-slate-900">{tm("calibration.program")}</h2>
      <Card className="mb-8 overflow-x-auto">
        <table
          className="min-w-full divide-y divide-slate-200 text-sm"
          data-testid="calibration-program"
        >
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{tm("equipment.fields.code")}</th>
              <th className="px-4 py-3">{tm("equipment.fields.name")}</th>
              <th className="px-4 py-3">{tm("equipment.fields.calibrationIntervalMonths")}</th>
              <th className="px-4 py-3">{tm("equipment.fields.lastCalibration")}</th>
              <th className="px-4 py-3">{tm("equipment.fields.nextCalibration")}</th>
              <th className="px-4 py-3">{tm("equipment.fields.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {program.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold">
                  <Link
                    href={`/metrologia/equipos/${e.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {e.code}
                  </Link>
                </td>
                <td className="px-4 py-3">{e.name}</td>
                <td className="px-4 py-3">{e.calibrationIntervalMonths}</td>
                <td className="px-4 py-3 whitespace-nowrap">{date(e.lastCalibrationAt)}</td>
                <td className="px-4 py-3">
                  <DueBadge date={e.nextCalibrationDue} />
                </td>
                <td className="px-4 py-3">{tm(`equipmentStatus.${e.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <h2 className="mb-3 text-lg font-semibold text-slate-900">{tm("calibration.records")}</h2>
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{tm("calibration.fields.code")}</th>
              <th className="px-4 py-3">{tm("calibration.fields.equipment")}</th>
              <th className="px-4 py-3">{tm("calibration.fields.calibratedAt")}</th>
              <th className="px-4 py-3">{tm("calibration.fields.result")}</th>
              <th className="px-4 py-3">{tm("calibration.fields.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {records.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {tm("calibration.empty")}
                </td>
              </tr>
            )}
            {records.map((c) => (
              <tr
                key={c.id}
                className="hover:bg-slate-50"
                data-testid={`calibration-row-${c.code}`}
              >
                <td className="px-4 py-3 font-mono font-semibold">
                  <Link
                    href={`/metrologia/calibraciones/${c.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {c.code}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono">{c.equipment.code}</span> · {c.equipment.name}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{date(c.calibratedAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge
                    value={RESULT_VALUE[c.result]}
                    label={tm(`calibrationResult.${c.result}`)}
                  />
                </td>
                <td className="px-4 py-3">{tm(`recordStatus.${c.status}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
