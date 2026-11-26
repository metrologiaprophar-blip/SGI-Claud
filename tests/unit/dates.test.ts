import { describe, expect, it } from "vitest";
import { addMonths, startOfDayInZone, todayInZone } from "@/lib/dates";

describe("fechas en la zona horaria de la empresa", () => {
  it("las 00:00 en Guayaquil son las 05:00 UTC", () => {
    expect(startOfDayInZone("2026-11-26", "America/Guayaquil").toISOString()).toBe(
      "2026-11-26T05:00:00.000Z",
    );
  });

  it("'hoy' depende de la zona: a las 02:00 UTC en Ecuador aún es el día anterior", () => {
    const at = new Date("2026-11-26T02:00:00Z");
    expect(todayInZone("America/Guayaquil", at)).toBe("2026-11-25");
    expect(todayInZone("UTC", at)).toBe("2026-11-26");
  });

  it("suma meses para la próxima revisión", () => {
    expect(addMonths(new Date("2026-01-15T05:00:00Z"), 24).toISOString()).toBe(
      "2028-01-15T05:00:00.000Z",
    );
  });
});
