/** Permisos GMP asignables a usuarios (PRD §2). */
export const PERMISSIONS = ["DOC_MANAGE", "DOC_APPROVE", "QA_APPROVE"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export function parsePermissions(value: unknown): Permission[] {
  return Array.isArray(value)
    ? value.filter((p): p is Permission => (PERMISSIONS as readonly string[]).includes(p))
    : [];
}
