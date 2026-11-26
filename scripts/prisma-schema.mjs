// Genera la variante SQLite del esquema a partir de prisma/schema.prisma (única fuente de verdad).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { provider } from "./env.mjs";

const source = readFileSync("prisma/schema.prisma", "utf8");
if (/^(?!\s*\/\/).*@db\./m.test(source)) {
  console.error("prisma/schema.prisma no debe usar tipos nativos @db.* (incompatibles con SQLite).");
  process.exit(1);
}
const sqlite = source.replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"');
mkdirSync("prisma/generated/sqlite", { recursive: true });
writeFileSync(
  "prisma/generated/sqlite/schema.prisma",
  "// ARCHIVO GENERADO por scripts/prisma-schema.mjs. No editar: edita prisma/schema.prisma.\n" + sqlite,
);
console.log(`Esquema listo (proveedor activo: ${provider}).`);
