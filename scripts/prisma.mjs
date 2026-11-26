// Ejecuta la CLI de Prisma con el esquema que corresponde a DATABASE_PROVIDER.
import { spawnSync } from "node:child_process";
import { schemaPath } from "./env.mjs";

const args = [...process.argv.slice(2), "--schema", schemaPath];
const result = spawnSync("npx", ["prisma", ...args], { stdio: "inherit", env: process.env });
process.exit(result.status ?? 1);
