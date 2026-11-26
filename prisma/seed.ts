/**
 * Datos iniciales: empresa de plataforma (SUPER_ADMIN), PROPHAR (admin + usuario de metrología)
 * y OTRA (solo para pruebas de aislamiento). Idempotente: puede ejecutarse varias veces.
 */
import "dotenv/config";
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_PASSWORD = "ChangeMe!2026";

function password(envVar: string) {
  const value = process.env[envVar]?.trim();
  if (value) return value;
  if (isProduction) throw new Error(`Defina ${envVar} para sembrar en producción.`);
  return DEFAULT_PASSWORD;
}

const forceChange = (process.env.SEED_FORCE_PASSWORD_CHANGE ?? "true") !== "false";

async function upsertOrg(data: {
  code: string;
  name: string;
  taxId?: string;
  isPlatform?: boolean;
}) {
  return prisma.organization.upsert({ where: { code: data.code }, update: {}, create: data });
}

/** Mapa de procesos inicial de PROPHAR (editable después por la empresa). */
const PROCESSES: [string, string][] = [
  ["DIR", "Dirección"],
  ["GC", "Gestión de la Calidad"],
  ["GAC", "Garantía de Calidad"],
  ["CC", "Control de Calidad"],
  ["PRO", "Producción"],
  ["ALM", "Almacenamiento y Distribución"],
  ["MET", "Metrología"],
  ["MAN", "Mantenimiento"],
  ["COM", "Compras"],
  ["VEN", "Ventas"],
  ["RH", "Talento Humano"],
  ["SSA", "Seguridad, Salud y Ambiente"],
];

async function seedProcesses(organizationId: string) {
  for (const [code, name] of PROCESSES) {
    await prisma.process.upsert({
      where: { organizationId_code: { organizationId, code } },
      update: {},
      create: { organizationId, code, name },
    });
  }
}

/** Asigna permisos GMP solo si el usuario aún no tiene ninguno (no pisa cambios hechos en la app). */
async function grant(userId: string, permissions: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  if (
    user &&
    (user.permissions === null ||
      (Array.isArray(user.permissions) && user.permissions.length === 0))
  ) {
    await prisma.user.update({ where: { id: userId }, data: { permissions } });
  }
}

async function upsertUser(
  organizationId: string,
  u: { username: string; fullName: string; role: Role; jobTitle?: string; email?: string },
  plain: string,
) {
  const existing = await prisma.user.findUnique({
    where: { organizationId_username: { organizationId, username: u.username } },
  });
  if (existing) return { user: existing, created: false };
  const user = await prisma.user.create({
    data: {
      organizationId,
      ...u,
      passwordHash: await bcrypt.hash(plain, 12),
      mustChangePassword: forceChange,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId,
      action: "user.create",
      entityType: "User",
      entityId: user.id,
      actorName: "seed",
      after: { username: u.username, role: u.role },
    },
  });
  return { user, created: true };
}

async function main() {
  const adminPassword = password("SEED_ADMIN_PASSWORD");
  const superPassword = password("SEED_SUPERADMIN_PASSWORD");

  const platform = await upsertOrg({
    code: "PLATFORM",
    name: "SGI Cloud (plataforma)",
    isPlatform: true,
  });
  const prophar = await upsertOrg({ code: "PROPHAR", name: "PROPHAR S.A." });
  const other = await upsertOrg({ code: "OTRA", name: "Empresa de pruebas (aislamiento)" });

  const results = [
    [
      "PLATFORM",
      await upsertUser(
        platform.id,
        { username: "superadmin", fullName: "Superadministrador", role: "SUPER_ADMIN" },
        superPassword,
      ),
    ],
    [
      "PROPHAR",
      await upsertUser(
        prophar.id,
        {
          username: "admin",
          fullName: "Administrador SGI",
          role: "ADMIN_EMPRESA",
          jobTitle: "Jefe de Garantía de Calidad",
        },
        adminPassword,
      ),
    ],
    [
      "PROPHAR",
      await upsertUser(
        prophar.id,
        {
          username: "metrologia",
          fullName: "Responsable de Metrología",
          role: "USUARIO",
          jobTitle: "Metrología",
        },
        adminPassword,
      ),
    ],
    [
      "PROPHAR",
      await upsertUser(
        prophar.id,
        {
          username: "calidad",
          fullName: "Analista de Garantía de Calidad",
          role: "USUARIO",
          jobTitle: "Analista de Garantía de Calidad",
        },
        adminPassword,
      ),
    ],
    [
      "OTRA",
      await upsertUser(
        other.id,
        { username: "admin", fullName: "Admin Empresa de pruebas", role: "ADMIN_EMPRESA" },
        adminPassword,
      ),
    ],
  ] as const;

  await seedProcesses(prophar.id);
  await seedProcesses(other.id);
  const byName = (code: string, username: string) =>
    results.find(([c, r]) => c === code && r.user.username === username)?.[1].user.id;
  // Circuito documental de ejemplo: metrología elabora, calidad revisa, el jefe de GC aprueba.
  await grant(byName("PROPHAR", "admin")!, ["DOC_MANAGE", "DOC_APPROVE"]);
  await grant(byName("PROPHAR", "metrologia")!, ["DOC_MANAGE"]);
  await grant(byName("OTRA", "admin")!, ["DOC_MANAGE", "DOC_APPROVE"]);

  console.log("\nSeed completado:");
  for (const [code, r] of results) {
    console.log(
      `  ${r.created ? "creado " : "existía"}  ${code.padEnd(9)} ${r.user.username.padEnd(11)} ${r.user.role}`,
    );
  }
  if (!isProduction) {
    console.log(
      `\nClave inicial (desarrollo): ${process.env.SEED_ADMIN_PASSWORD ? "la de SEED_ADMIN_PASSWORD" : DEFAULT_PASSWORD}`,
    );
    console.log(forceChange ? "Se pedirá cambiarla en el primer acceso.\n" : "");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
