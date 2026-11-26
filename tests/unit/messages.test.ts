import { describe, expect, it } from "vitest";
import es from "../../messages/es.json";
import en from "../../messages/en.json";
import pt from "../../messages/pt.json";
import { NAV_AREAS } from "@/config/navigation";

type Tree = { [k: string]: string | Tree };
const flatten = (obj: Tree, prefix = ""): [string, string][] =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string"
      ? [[`${prefix}${k}`, v] as [string, string]]
      : flatten(v, `${prefix}${k}.`),
  );
const keys = (obj: Tree) => flatten(obj).map(([k]) => k);

describe("diccionarios de idioma", () => {
  const esKeys = keys(es as Tree).sort();

  it.each([
    ["en", en],
    ["pt", pt],
  ])("%s tiene exactamente las mismas claves que es", (_name, dict) => {
    expect(keys(dict as Tree).sort()).toEqual(esKeys);
  });

  it("ningún texto está vacío", () => {
    for (const dict of [es, en, pt])
      for (const [k, v] of flatten(dict as Tree)) expect(v.trim(), k).not.toBe("");
  });

  it("cada área y herramienta del menú tiene título y descripción", () => {
    const set = new Set(esKeys);
    for (const area of NAV_AREAS) {
      expect(set.has(`nav.areas.${area.key}`)).toBe(true);
      expect(set.has(`nav.areaDescriptions.${area.key}`)).toBe(true);
      for (const tool of area.tools) {
        expect(set.has(`nav.tools.${tool.key}`), tool.key).toBe(true);
        expect(set.has(`nav.toolDescriptions.${tool.key}`), tool.key).toBe(true);
      }
    }
  });
});
