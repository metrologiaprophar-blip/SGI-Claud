import { describe, expect, it } from "vitest";
import { findTool, matchPath, NAV_AREAS, visibleAreas } from "@/config/navigation";

describe("navegación", () => {
  it("Administración solo es visible para administradores", () => {
    expect(visibleAreas("USUARIO").some((a) => a.key === "admin")).toBe(false);
    expect(visibleAreas("ADMIN_EMPRESA").some((a) => a.key === "admin")).toBe(true);
  });

  it("resuelve migas y herramientas", () => {
    expect(matchPath("/calidad/desviaciones")?.tool?.key).toBe("deviations");
    expect(matchPath("/admin/usuarios")?.area.key).toBe("admin");
    expect(findTool("metrologia", "calibraciones")?.tool.phase).toBe(4);
    expect(findTool("admin", "usuarios")).toBeNull(); // admin tiene rutas propias
  });

  it("las rutas son únicas", () => {
    const slugs = NAV_AREAS.flatMap((a) => a.tools.map((t) => `${a.slug}/${t.slug}`));
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
