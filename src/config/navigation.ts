import type { Role } from "@prisma/client";

/**
 * Fuente única del menú superior (PRD §8). Cada herramienta nueva se registra aquí.
 * - `key`: clave i18n bajo `nav.tools.<key>` (título) y `nav.toolDescriptions.<key>`.
 * - `phase`: fase del roadmap; las herramientas con phase > CURRENT_PHASE muestran "Próximamente".
 */
export const CURRENT_PHASE = 1;

export type NavTool = { key: string; slug: string; phase: number; standards: Standard[] };
export type NavArea = {
  key: string;
  slug: string;
  icon: IconName;
  tools: NavTool[];
  roles?: Role[];
  /** Ruta base cuando el área tiene páginas propias (p. ej. Administración). */
  basePath?: string;
};

export type Standard = "GMP" | "BPADT" | "ISO9001";
export type IconName =
  "home" | "docs" | "quality" | "gauge" | "truck" | "audit" | "system" | "more" | "admin";

const t = (key: string, slug: string, phase: number, standards: Standard[]): NavTool => ({
  key,
  slug,
  phase,
  standards,
});
const ALL: Standard[] = ["GMP", "BPADT", "ISO9001"];

export const NAV_AREAS: NavArea[] = [
  {
    key: "documents",
    slug: "documentos",
    icon: "docs",
    tools: [
      t("masterList", "listado-maestro", 2, ALL),
      t("sops", "procedimientos", 2, ALL),
      t("specifications", "especificaciones", 2, ["GMP"]),
      t("records", "registros", 2, ALL),
      t("reviewInbox", "bandeja-revision", 2, ALL),
      t("mySignatures", "mis-firmas", 2, ALL),
    ],
  },
  {
    key: "quality",
    slug: "calidad",
    icon: "quality",
    tools: [
      t("deviations", "desviaciones", 3, ["GMP", "BPADT"]),
      t("capa", "capa", 3, ALL),
      t("changeControl", "control-cambios", 3, ["GMP", "BPADT"]),
      t("complaints", "quejas", 6, ALL),
      t("oos", "oos-oot", 8, ["GMP"]),
      t("batchRelease", "liberacion-lotes", 8, ["GMP"]),
      t("apqr", "revision-anual-producto", 7, ["GMP"]),
    ],
  },
  {
    key: "metrology",
    slug: "metrologia",
    icon: "gauge",
    tools: [
      t("equipment", "equipos", 4, ALL),
      t("calibrations", "calibraciones", 4, ALL),
      t("verifications", "verificaciones", 4, ALL),
      t("qualifications", "calificaciones", 4, ["GMP", "BPADT"]),
      t("maintenance", "mantenimiento", 4, ALL),
    ],
  },
  {
    key: "warehouse",
    slug: "almacen",
    icon: "truck",
    tools: [
      t("storageAreas", "areas-sensores", 5, ["BPADT", "GMP"]),
      t("environment", "temperatura-humedad", 5, ["BPADT", "GMP"]),
      t("excursions", "excursiones", 5, ["BPADT", "GMP"]),
      t("receiving", "recepcion", 5, ["BPADT", "GMP"]),
      t("dispatch", "despacho-transporte", 5, ["BPADT"]),
      t("returns", "devoluciones", 5, ["BPADT"]),
      t("recalls", "retiros", 5, ["BPADT", "GMP"]),
    ],
  },
  {
    key: "audits",
    slug: "auditorias",
    icon: "audit",
    tools: [
      t("auditPlan", "plan-anual", 6, ALL),
      t("selfInspections", "autoinspecciones", 6, ["GMP", "BPADT"]),
      t("supplierAudits", "auditorias-proveedores", 6, ALL),
      t("authorityInspections", "inspecciones-autoridad", 6, ["GMP", "BPADT"]),
    ],
  },
  {
    key: "system",
    slug: "sgi",
    icon: "system",
    tools: [
      t("context", "contexto", 7, ["ISO9001"]),
      t("policy", "politica", 7, ALL),
      t("risks", "riesgos", 7, ALL),
      t("indicators", "indicadores", 7, ALL),
      t("managementReview", "revision-direccion", 7, ALL),
    ],
  },
  {
    key: "more",
    slug: "mas",
    icon: "more",
    tools: [
      t("training", "capacitacion", 6, ALL),
      t("suppliers", "proveedores-clientes", 6, ALL),
      t("products", "productos-registros", 8, ["GMP", "BPADT"]),
    ],
  },
  {
    key: "admin",
    slug: "admin",
    icon: "admin",
    basePath: "/admin",
    roles: ["ADMIN_EMPRESA", "SUPER_ADMIN"],
    tools: [
      t("users", "usuarios", 1, ALL),
      t("resetRequests", "solicitudes-clave", 1, ALL),
      t("auditTrail", "auditoria", 1, ALL),
      t("organization", "empresa", 1, ALL),
    ],
  },
];

export const toolHref = (area: NavArea, tool: NavTool) =>
  `${area.basePath ?? `/${area.slug}`}/${tool.slug}`;
export const areaHref = (area: NavArea) => area.basePath ?? `/${area.slug}`;

export function visibleAreas(role: Role) {
  return NAV_AREAS.filter((a) => !a.roles || a.roles.includes(role));
}

export function findArea(slug: string) {
  return NAV_AREAS.find((a) => a.slug === slug && !a.basePath);
}

export function findTool(areaSlug: string, toolSlug: string) {
  const area = findArea(areaSlug);
  const tool = area?.tools.find((x) => x.slug === toolSlug);
  return area && tool ? { area, tool } : null;
}

/** Área y herramienta que corresponden a una ruta (para las migas). */
export function matchPath(pathname: string) {
  for (const area of NAV_AREAS) {
    const base = areaHref(area);
    if (pathname === base) return { area, tool: undefined };
    for (const tool of area.tools) {
      const href = toolHref(area, tool);
      if (pathname === href || pathname.startsWith(`${href}/`)) return { area, tool };
    }
  }
  return null;
}
