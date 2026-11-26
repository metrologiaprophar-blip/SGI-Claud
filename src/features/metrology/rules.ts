import type { CalibrationResult, ProficiencyOutcome } from "@prisma/client";

/** Punto de calibración: valor nominal (patrón), lectura del equipo e incertidumbre expandida U (k=2). */
export type PointInput = { nominal: number; reading: number; uncertainty: number };
export type EvaluatedPoint = PointInput & { error: number; conform: boolean | null };

const round = (n: number) => Math.round(n * 1e9) / 1e9;

/**
 * Regla de decisión documentada (ILAC-G8, aceptación con banda de guarda = U):
 * un punto es conforme si |error| + U ≤ EMP. Sin EMP definido, la conformidad la decide la persona.
 */
export function evaluatePoints(
  points: PointInput[],
  maxPermissibleError: number | null | undefined,
) {
  const evaluated: EvaluatedPoint[] = points.map((p) => {
    const error = round(p.reading - p.nominal);
    const conform =
      maxPermissibleError == null
        ? null
        : Math.abs(error) + Math.abs(p.uncertainty) <= maxPermissibleError + 1e-12;
    return { ...p, error, conform };
  });
  const computed: CalibrationResult | null =
    maxPermissibleError == null || evaluated.length === 0
      ? null
      : evaluated.every((p) => p.conform)
        ? "CONFORM"
        : "NON_CONFORM";
  return { points: evaluated, computed };
}

/** Resultado final: si hay EMP manda el cálculo; "Ajustado" solo es válido si el resultado tras el ajuste es conforme. */
export function finalCalibrationResult(
  computed: CalibrationResult | null,
  declared: CalibrationResult | null,
): CalibrationResult | null {
  if (computed === null) return declared;
  if (computed === "NON_CONFORM") return "NON_CONFORM";
  return declared === "ADJUSTED" ? "ADJUSTED" : "CONFORM";
}

/** z = (x − X) / σpt (ISO 13528). */
export function zScore(reported: number, assigned: number, sigma: number) {
  if (!(sigma > 0)) throw new Error("sigma_invalid");
  return Math.round(((reported - assigned) / sigma) * 100) / 100;
}

export function proficiencyOutcome(z: number): ProficiencyOutcome {
  const a = Math.abs(z);
  return a <= 2 ? "SATISFACTORY" : a < 3 ? "QUESTIONABLE" : "UNSATISFACTORY";
}

export type DueState = "NONE" | "OK" | "DUE_SOON" | "OVERDUE";

/** Estado de un vencimiento: vencido, próximo (≤ 30 días) o vigente. */
export function dueState(due: Date | null | undefined, now = new Date(), soonDays = 30): DueState {
  if (!due) return "NONE";
  if (due < now) return "OVERDUE";
  return due.getTime() - now.getTime() <= soonDays * 86_400_000 ? "DUE_SOON" : "OK";
}
