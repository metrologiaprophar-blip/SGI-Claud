import type { TenantDb } from "@/server/db/tenant-client";

/** Equipos activos para los selectores de los formularios de registro. */
export function equipmentOptions(db: TenantDb) {
  return db.equipment.findMany({
    where: { status: { not: "RETIRED" } },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });
}
