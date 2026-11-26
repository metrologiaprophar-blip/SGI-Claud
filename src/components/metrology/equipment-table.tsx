import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Equipment } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DueBadge } from "./due-badge";

type Row = Equipment & { process: { code: string }; owner: { fullName: string } };
const STATUS_TONE = {
  IN_SERVICE: "success",
  OUT_OF_SERVICE: "danger",
  RETIRED: "neutral",
} as const;

/** Tabla de equipos con estado y vencimientos (inventario, patrones). */
export async function EquipmentTable({
  rows,
  showVerification = true,
}: {
  rows: Row[];
  showVerification?: boolean;
}) {
  const t = await getTranslations("metrology");
  return (
    <Card className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-4 py-3">{t("equipment.fields.code")}</th>
            <th className="px-4 py-3">{t("equipment.fields.name")}</th>
            <th className="px-4 py-3">{t("equipment.fields.status")}</th>
            <th className="px-4 py-3">{t("equipment.fields.nextCalibration")}</th>
            {showVerification && (
              <th className="px-4 py-3">{t("equipment.fields.nextVerification")}</th>
            )}
            <th className="px-4 py-3">{t("equipment.fields.owner")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                {t("equipment.empty")}
              </td>
            </tr>
          )}
          {rows.map((e) => (
            <tr
              key={e.id}
              className="align-top hover:bg-slate-50"
              data-testid={`equipment-row-${e.code}`}
            >
              <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                <Link
                  href={`/metrologia/equipos/${e.id}`}
                  className="text-brand-700 hover:underline"
                >
                  {e.code}
                </Link>
              </td>
              <td className="px-4 py-3">
                <Link
                  href={`/metrologia/equipos/${e.id}`}
                  className="hover:text-brand-800 font-medium text-slate-900"
                >
                  {e.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {e.equipmentType} · {e.process.code}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
                {e.isReferenceStandard && (
                  <Badge tone="brand" className="mt-1">
                    {t("equipment.fields.isReferenceStandard")}
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[e.status]}>{t(`equipmentStatus.${e.status}`)}</Badge>
              </td>
              <td className="px-4 py-3">
                <DueBadge date={e.nextCalibrationDue} />
              </td>
              {showVerification && (
                <td className="px-4 py-3">
                  <DueBadge date={e.nextVerificationDue} />
                </td>
              )}
              <td className="px-4 py-3 whitespace-nowrap">{e.owner.fullName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
