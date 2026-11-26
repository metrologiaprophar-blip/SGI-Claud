import type { PrismaClient } from "@prisma/client";

/** Modelos de negocio con columna organizationId. Todo modelo nuevo con organizationId se añade aquí. */
export const TENANT_MODELS = new Set([
  "User",
  "PasswordResetRequest",
  "AuditLog",
  "Process",
  "Document",
  "DocumentVersion",
  "ElectronicSignature",
  "ReadAcknowledgement",
  "Deviation",
  "Capa",
  "ChangeControl",
  "QualityAction",
  "Equipment",
  "Calibration",
  "Verification",
  "Maintenance",
  "Qualification",
  "ProficiencyTest",
]);

/** Modelos de solo inserción (integridad de datos GMP). */
const APPEND_ONLY_MODELS = new Set(["AuditLog", "ElectronicSignature"]);

type Args = Record<string, unknown>;

export class TenantViolationError extends Error {
  constructor(message: string) {
    super(`Violación de aislamiento por empresa: ${message}`);
    this.name = "TenantViolationError";
  }
}

function isRecord(value: unknown): value is Args {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Crea un cliente que impone organizationId en todas las operaciones.
 * Convención: en altas usar claves foráneas escalares (userId), no `connect`.
 */
export function createTenantClient(base: PrismaClient, organizationId: string) {
  if (!organizationId) throw new TenantViolationError("organizationId vacío");

  const scopeWhere = (where: unknown, field = "organizationId"): Args => {
    if (where !== undefined && !isRecord(where)) throw new TenantViolationError("where no válido");
    const w = (where ?? {}) as Args;
    if (field in w && w[field] !== organizationId) {
      throw new TenantViolationError(`${field} distinto al de la sesión`);
    }
    return { ...w, [field]: organizationId };
  };

  const withOrg = (data: unknown): Args => {
    if (!isRecord(data)) throw new TenantViolationError("data no válido");
    if ("organization" in data)
      throw new TenantViolationError("no usar relación organization en altas");
    if ("organizationId" in data && data.organizationId !== organizationId) {
      throw new TenantViolationError("alta en otra empresa");
    }
    return { ...data, organizationId };
  };

  const assertNoOrgChange = (data: unknown) => {
    if (!isRecord(data)) return;
    if (
      "organization" in data ||
      ("organizationId" in data && data.organizationId !== organizationId)
    ) {
      throw new TenantViolationError("no se puede cambiar la empresa de un registro");
    }
  };

  return base.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a: Args = isRecord(args) ? { ...args } : {};

          if (model === "Organization") {
            if (
              ![
                "findUnique",
                "findUniqueOrThrow",
                "findFirst",
                "findFirstOrThrow",
                "update",
              ].includes(operation)
            ) {
              throw new TenantViolationError(
                `operación ${operation} no permitida sobre Organization`,
              );
            }
            a.where = scopeWhere(a.where, "id");
            if (operation === "update") assertNoOrgChange(a.data);
            return query(a);
          }

          if (!TENANT_MODELS.has(model)) {
            throw new TenantViolationError(
              `el modelo ${model} no está registrado en TENANT_MODELS`,
            );
          }
          if (APPEND_ONLY_MODELS.has(model) && /^(update|upsert|delete)/.test(operation)) {
            throw new Error(`${model} es de solo inserción`);
          }

          switch (operation) {
            case "create":
              a.data = withOrg(a.data);
              break;
            case "createMany":
            case "createManyAndReturn":
              a.data = Array.isArray(a.data) ? a.data.map(withOrg) : withOrg(a.data);
              break;
            case "upsert":
              a.where = scopeWhere(a.where);
              a.create = withOrg(a.create);
              assertNoOrgChange(a.update);
              break;
            case "update":
            case "updateMany":
            case "updateManyAndReturn":
              a.where = scopeWhere(a.where);
              assertNoOrgChange(a.data);
              break;
            default:
              // findUnique, findFirst, findMany, count, aggregate, groupBy, delete, deleteMany…
              a.where = scopeWhere(a.where);
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;
