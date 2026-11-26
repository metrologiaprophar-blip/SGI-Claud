// Carga .env y resuelve el proveedor de base de datos y la ruta del esquema.
import { existsSync } from "node:fs";
import { config } from "dotenv";

if (existsSync(".env")) config({ path: ".env", quiet: true });

export const provider = (process.env.DATABASE_PROVIDER ?? "sqlite").toLowerCase();
if (!["sqlite", "postgresql"].includes(provider)) {
  console.error(`DATABASE_PROVIDER no válido: ${provider} (usa "sqlite" o "postgresql")`);
  process.exit(1);
}
process.env.DATABASE_URL ??= provider === "sqlite" ? "file:./dev.db" : "";
export const schemaPath =
  provider === "sqlite" ? "prisma/generated/sqlite/schema.prisma" : "prisma/schema.prisma";
