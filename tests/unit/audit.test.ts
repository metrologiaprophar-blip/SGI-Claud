import { describe, expect, it } from "vitest";
import { diff, sanitize } from "@/server/audit";

describe("auditoría", () => {
  it("nunca guarda contraseñas, hashes ni tokens", () => {
    const clean = sanitize({
      username: "ana",
      passwordHash: "x",
      passwordHistory: ["h"],
      newPassword: "y",
      token: "z",
      nested: { apiSecret: "s", ok: 1 },
      passwordMaxAgeDays: 90,
    });
    expect(clean).toEqual({ username: "ana", nested: { ok: 1 }, passwordMaxAgeDays: 90 });
  });

  it("diff devuelve solo los campos que cambian", () => {
    const d = diff({ a: 1, b: "x", c: new Date(0) }, { a: 1, b: "y", c: new Date(0) });
    expect(d).toEqual({ before: { b: "x" }, after: { b: "y" }, changed: true });
    expect(diff({ a: 1 }, { a: 1 }).changed).toBe(false);
  });
});
