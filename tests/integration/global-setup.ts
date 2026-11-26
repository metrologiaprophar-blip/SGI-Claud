import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Archivo SQLite exclusivo de las pruebas (relativo al esquema generado). Nunca es la BD de desarrollo. */
const TEST_DB_FILE = "prisma/generated/sqlite/test.db";

/** Crea desde cero la base de datos de pruebas antes de cada ejecución. */
export default function setup() {
  const env = { ...process.env, DATABASE_PROVIDER: "sqlite", DATABASE_URL: "file:./test.db" };
  const gen = spawnSync("node", ["scripts/prisma-schema.mjs"], { env, stdio: "inherit" });
  if (gen.status !== 0) throw new Error("No se pudo generar el esquema SQLite");
  for (const suffix of ["", "-journal"]) rmSync(`${TEST_DB_FILE}${suffix}`, { force: true });
  rmSync("storage-test", { recursive: true, force: true }); // archivos subidos por las pruebas
  const push = spawnSync(
    "npx",
    [
      "prisma",
      "db",
      "push",
      "--skip-generate",
      "--schema",
      "prisma/generated/sqlite/schema.prisma",
    ],
    {
      env,
      stdio: "pipe",
      encoding: "utf8",
    },
  );
  if (push.status !== 0) throw new Error(`prisma db push falló:\n${push.stdout}\n${push.stderr}`);
}
