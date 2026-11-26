import { PrismaClient } from "@prisma/client";

/**
 * Cliente Prisma SIN filtro de empresa. Uso restringido a src/server/**, prisma/seed.ts
 * y la consola SUPER_ADMIN. El resto de la aplicación usa getTenantDb().
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
  // Integridad de datos GMP: el registro de auditoría y las firmas electrónicas son de solo inserción.
  const appendOnly = (model: string) => ({
    update: () => {
      throw new Error(`${model} es de solo inserción`);
    },
    updateMany: () => {
      throw new Error(`${model} es de solo inserción`);
    },
    upsert: () => {
      throw new Error(`${model} es de solo inserción`);
    },
    delete: () => {
      throw new Error(`${model} es de solo inserción`);
    },
    deleteMany: () => {
      throw new Error(`${model} es de solo inserción`);
    },
  });
  return client.$extends({
    name: "append-only",
    query: {
      electronicSignature: appendOnly("ElectronicSignature"),
      auditLog: {
        update: () => {
          throw new Error("AuditLog es de solo inserción");
        },
        updateMany: () => {
          throw new Error("AuditLog es de solo inserción");
        },
        upsert: () => {
          throw new Error("AuditLog es de solo inserción");
        },
        delete: () => {
          throw new Error("AuditLog es de solo inserción");
        },
        deleteMany: () => {
          throw new Error("AuditLog es de solo inserción");
        },
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
