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

/**
 * Asegura los permisos GMP de referencia del seed (los añade si faltan, no quita ninguno).
 * Ejecutar el seed de nuevo tras una actualización incorpora los permisos de módulos nuevos.
 */
async function grant(userId: string, permissions: string[]) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { permissions: true },
  });
  if (!user) return;
  const current = Array.isArray(user.permissions) ? (user.permissions as string[]) : [];
  const merged = [...new Set([...current, ...permissions])].sort();
  if (merged.length !== current.length)
    await prisma.user.update({ where: { id: userId }, data: { permissions: merged } });
}

/** Equipos de ejemplo de un laboratorio farmacéutico (solo si la empresa aún no tiene equipos). */
async function seedEquipment(organizationId: string, ownerId: string) {
  if ((await prisma.equipment.count({ where: { organizationId } })) > 0) return;
  const proc = async (code: string) =>
    (
      await prisma.process.findUniqueOrThrow({
        where: { organizationId_code: { organizationId, code } },
      })
    ).id;
  const [cc, alm, met] = [await proc("CC"), await proc("ALM"), await proc("MET")];
  const items = [
    {
      code: "BAL-001",
      name: "Balanza analítica",
      equipmentType: "Balanza",
      manufacturer: "Mettler Toledo",
      model: "XPR205",
      location: "Laboratorio CC",
      processId: cc,
      criticality: "HIGH" as const,
      measurementRange: "0–220 g",
      resolution: "0,01 mg",
      unit: "g",
      maxPermissibleError: 0.0005,
      calibrationIntervalMonths: 12,
      verificationIntervalDays: 30,
    },
    {
      code: "TER-012",
      name: "Termohigrómetro cámara fría 2",
      equipmentType: "Termohigrómetro",
      location: "Almacén – Cámara fría 2",
      processId: alm,
      criticality: "HIGH" as const,
      measurementRange: "-20–60 °C",
      resolution: "0,1 °C",
      unit: "°C",
      maxPermissibleError: 0.5,
      calibrationIntervalMonths: 12,
    },
    {
      code: "PAT-PES-001",
      name: "Juego de pesas patrón E2",
      equipmentType: "Pesas patrón",
      location: "Metrología",
      processId: met,
      criticality: "HIGH" as const,
      isReferenceStandard: true,
      measurementRange: "1 mg–200 g",
      unit: "g",
      calibrationIntervalMonths: 24,
    },
    {
      code: "PH-003",
      name: "pHmetro de mesa",
      equipmentType: "pHmetro",
      location: "Laboratorio CC",
      processId: cc,
      criticality: "MEDIUM" as const,
      measurementRange: "0–14 pH",
      resolution: "0,01 pH",
      unit: "pH",
      maxPermissibleError: 0.05,
      calibrationIntervalMonths: 6,
      verificationIntervalDays: 1,
      maintenanceIntervalMonths: 12,
    },
  ];
  const day = 86_400_000;
  const now = Date.now();
  // Fechas de ejemplo: patrón vigente, balanza que vence pronto, termohigrómetro vencido, pHmetro vigente.
  const dates: Record<string, { last: number; next: number }> = {
    "PAT-PES-001": { last: now - 200 * day, next: now + 530 * day },
    "BAL-001": { last: now - 350 * day, next: now + 15 * day },
    "TER-012": { last: now - 380 * day, next: now - 15 * day },
    "PH-003": { last: now - 60 * day, next: now + 120 * day },
  };
  for (const item of items) {
    const d = dates[item.code]!;
    await prisma.equipment.create({
      data: {
        organizationId,
        ownerId,
        ...item,
        lastCalibrationAt: new Date(d.last),
        nextCalibrationDue: new Date(d.next),
      },
    });
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
  await grant(byName("PROPHAR", "admin")!, [
    "DOC_MANAGE",
    "DOC_APPROVE",
    "QA_APPROVE",
    "METROLOGY_APPROVE",
  ]);
  await grant(byName("PROPHAR", "metrologia")!, ["DOC_MANAGE", "METROLOGY_MANAGE"]);
  await grant(byName("PROPHAR", "calidad")!, ["QA_APPROVE", "METROLOGY_APPROVE"]);
  await seedEquipment(prophar.id, byName("PROPHAR", "metrologia")!);
  await grant(byName("OTRA", "admin")!, ["DOC_MANAGE", "DOC_APPROVE", "QA_APPROVE"]);

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
