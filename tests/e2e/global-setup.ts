import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

/** Base de datos exclusiva para e2e: se crea desde cero y se siembra sin cambio de clave obligatorio. */
export default function globalSetup() {
  const env = {
    ...process.env,
    DATABASE_PROVIDER: "sqlite",
    DATABASE_URL: "file:./e2e.db",
    SEED_FORCE_PASSWORD_CHANGE: "false",
  };
  for (const suffix of ["", "-journal"])
    rmSync(`prisma/generated/sqlite/e2e.db${suffix}`, { force: true });
  rmSync("storage-e2e", { recursive: true, force: true });
  const run = (cmd: string, args: string[]) => {
    const r = spawnSync(cmd, args, { env, stdio: "inherit" });
    if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} falló`);
  };
  run("node", ["scripts/prisma-schema.mjs"]);
  run("npx", [
    "prisma",
    "db",
    "push",
    "--skip-generate",
    "--schema",
    "prisma/generated/sqlite/schema.prisma",
  ]);
  run("npx", ["tsx", "prisma/seed.ts"]);
}
