import { describe, expect, it } from "vitest";
import { normalizeOrgCode, normalizeUsername, RUC_PATTERN } from "@/lib/identity";

describe("identificadores", () => {
  it("normaliza ID corporativo y usuario", () => {
    expect(normalizeOrgCode(" prophar ")).toBe("PROPHAR");
    expect(normalizeUsername(" Metrologia ")).toBe("metrologia");
  });

  it.each([
    ["0991234567001", true],
    ["1790012345001", true],
    ["099123456700", false],
    ["0991234567002", false],
    ["09912345670011", false],
    ["09912A4567001", false],
  ])("RUC %s → %s", (ruc, valid) => {
    expect(RUC_PATTERN.test(ruc)).toBe(valid);
  });
});
