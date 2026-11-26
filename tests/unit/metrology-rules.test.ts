import { describe, expect, it } from "vitest";
import {
  dueState,
  evaluatePoints,
  finalCalibrationResult,
  proficiencyOutcome,
  zScore,
} from "@/features/metrology/rules";

describe("regla de decisión de calibración (|error| + U ≤ EMP)", () => {
  it("conforme cuando todos los puntos cumplen con su incertidumbre", () => {
    const r = evaluatePoints(
      [
        { nominal: 100, reading: 100.0002, uncertainty: 0.0002 },
        { nominal: 200, reading: 199.9997, uncertainty: 0.0002 },
      ],
      0.0005,
    );
    expect(r.points.map((p) => p.error)).toEqual([0.0002, -0.0003]);
    expect(r.computed).toBe("CONFORM");
  });

  it("no conforme si el error es pequeño pero la incertidumbre agota el EMP", () => {
    const r = evaluatePoints([{ nominal: 50, reading: 50.0004, uncertainty: 0.0002 }], 0.0005);
    expect(r.points[0]?.conform).toBe(false);
    expect(r.computed).toBe("NON_CONFORM");
  });

  it("sin EMP no calcula y respeta la decisión declarada", () => {
    const r = evaluatePoints([{ nominal: 25, reading: 25.3, uncertainty: 0.2 }], null);
    expect(r.computed).toBeNull();
    expect(finalCalibrationResult(r.computed, "CONFORM")).toBe("CONFORM");
  });

  it("'ajustado' solo es posible si el resultado calculado es conforme", () => {
    expect(finalCalibrationResult("CONFORM", "ADJUSTED")).toBe("ADJUSTED");
    expect(finalCalibrationResult("NON_CONFORM", "CONFORM")).toBe("NON_CONFORM");
    expect(finalCalibrationResult("NON_CONFORM", "ADJUSTED")).toBe("NON_CONFORM");
  });
});

describe("ensayos de aptitud (ISO 13528)", () => {
  it("calcula z y clasifica", () => {
    expect(zScore(10.3, 10, 0.2)).toBe(1.5);
    expect(proficiencyOutcome(1.5)).toBe("SATISFACTORY");
    expect(proficiencyOutcome(-2.5)).toBe("QUESTIONABLE");
    expect(proficiencyOutcome(3)).toBe("UNSATISFACTORY");
    expect(() => zScore(1, 1, 0)).toThrow();
  });
});

describe("vencimientos", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  it("vencido, próximo y vigente", () => {
    expect(dueState(new Date("2026-11-20"), now)).toBe("OVERDUE");
    expect(dueState(new Date("2026-12-10"), now)).toBe("DUE_SOON");
    expect(dueState(new Date("2027-06-01"), now)).toBe("OK");
    expect(dueState(null, now)).toBe("NONE");
  });
});
