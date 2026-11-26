import { prisma } from "./db/client";

/** Comprueba la conexión con la base de datos. Devuelve la latencia en ms o null si falla. */
export async function checkDatabase(): Promise<number | null> {
  const started = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Date.now() - started;
  } catch {
    return null;
  }
}
