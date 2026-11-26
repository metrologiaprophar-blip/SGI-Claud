"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { evaluatePoints } from "@/features/metrology/rules";
import { cn } from "@/lib/cn";

type Row = { nominal: string; reading: string; uncertainty: string };
const empty: Row = { nominal: "", reading: "", uncertainty: "" };
const toNum = (v: string) => (v.trim() === "" ? Number.NaN : Number(v.replace(",", ".")));

/**
 * Editor de puntos de calibración. Calcula en vivo el error y la conformidad con la misma regla que el
 * servidor (|error| + U ≤ EMP). Envía los puntos como JSON en el campo oculto "points".
 */
export function CalibrationPointsField({ emp, unit }: { emp: number | null; unit: string | null }) {
  const t = useTranslations("metrology.calibration.points");
  const [rows, setRows] = useState<Row[]>([{ ...empty }, { ...empty }, { ...empty }]);
  const parsed = rows.map((r) => ({
    nominal: toNum(r.nominal),
    reading: toNum(r.reading),
    uncertainty: toNum(r.uncertainty),
  }));
  const complete = parsed.filter((p) =>
    [p.nominal, p.reading, p.uncertainty].every(Number.isFinite),
  );
  const evaluated = evaluatePoints(complete, emp);
  let k = 0;
  const update = (i: number, key: keyof Row, value: string) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">{t("title")}</legend>
      <p className="text-xs text-slate-500">
        {emp !== null ? t("rule", { emp, unit: unit ?? "" }) : t("noEmp")}
      </p>
      <input type="hidden" name="points" value={JSON.stringify(complete)} />
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="pr-2 pb-1">{t("nominal")}</th>
              <th className="pr-2 pb-1">{t("reading")}</th>
              <th className="pr-2 pb-1">{t("uncertainty")}</th>
              <th className="pr-2 pb-1">{t("error")}</th>
              <th className="pr-2 pb-1">{t("conform")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const ok = [parsed[i]!.nominal, parsed[i]!.reading, parsed[i]!.uncertainty].every(
                Number.isFinite,
              );
              const point = ok ? evaluated.points[k++] : undefined;
              return (
                <tr key={i}>
                  {(["nominal", "reading", "uncertainty"] as const).map((key) => (
                    <td key={key} className="pr-2 pb-2">
                      <input
                        aria-label={`${t(key)} ${i + 1}`}
                        inputMode="decimal"
                        value={row[key]}
                        onChange={(e) => update(i, key, e.target.value)}
                        className={cn(inputClass, "min-w-24 py-1.5")}
                      />
                    </td>
                  ))}
                  <td className="pr-2 pb-2 font-mono text-xs whitespace-nowrap">
                    {point ? point.error : "—"}
                  </td>
                  <td className="pr-2 pb-2 text-xs whitespace-nowrap">
                    {point?.conform === true && (
                      <span className="font-semibold text-emerald-700">{t("yes")}</span>
                    )}
                    {point?.conform === false && (
                      <span className="font-semibold text-red-700">{t("no")}</span>
                    )}
                    {(!point || point.conform === null) && "—"}
                  </td>
                  <td className="pb-2">
                    {rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                        className="text-xs text-slate-500 hover:text-red-700"
                      >
                        {t("remove")}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, { ...empty }])}>
        {t("add")}
      </Button>
    </fieldset>
  );
}
