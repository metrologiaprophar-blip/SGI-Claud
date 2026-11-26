// Crea o actualiza la base de datos: SQLite → db push; PostgreSQL → migrate deploy.
import { spawnSync } from "node:child_process";
import { provider, schemaPath } from "./env.mjs";

const args =
  provider === "sqlite"
    ? ["prisma", "db", "push", "--skip-generate", "--schema", schemaPath]
    : ["prisma", "migrate", "deploy", "--schema", schemaPath];
const result = spawnSync("npx", args, { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
