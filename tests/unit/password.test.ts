import { describe, expect, it } from "vitest";
import {
  checkPasswordPolicy,
  generateTemporaryPassword,
  nextHistory,
  PASSWORD_HISTORY_SIZE,
} from "@/server/auth/password";

describe("política de contraseñas", () => {
  it.each([
    ["Corta1", "too_short"],
    ["sololetrasmuylarga", "needs_letter_and_digit"],
    ["12345678901", "needs_letter_and_digit"],
    ["x".repeat(60) + "12345", "too_long"],
  ])("%s → %s", (pw, expected) => {
    expect(checkPasswordPolicy(pw)).toBe(expected);
  });

  it("no permite contener el usuario", () => {
    expect(checkPasswordPolicy("Metrologia2026", "metrologia")).toBe("contains_username");
  });

  it("acepta una clave válida", () => {
    expect(checkPasswordPolicy("Prophar2026Seguro", "admin")).toBeNull();
  });

  it("las claves temporales cumplen la política y no se repiten", () => {
    const set = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
    expect(set.size).toBe(50);
    for (const pw of set) expect(checkPasswordPolicy(pw)).toBeNull();
  });

  it("el historial conserva como máximo las últimas claves", () => {
    let history: string[] = [];
    for (let i = 0; i < 8; i++) history = nextHistory(`h${i}`, history);
    expect(history).toHaveLength(PASSWORD_HISTORY_SIZE);
    expect(history[0]).toBe("h7");
  });
});
