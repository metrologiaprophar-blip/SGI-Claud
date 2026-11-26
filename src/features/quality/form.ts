import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, runAction } from "@/server/action";
import type { ServiceContext } from "@/server/context";

/** Lectura de campos de FormData (texto recortado; vacío → ""). */
export const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
export const optional = (fd: FormData, name: string) => field(fd, name) || null;
export const checked = (fd: FormData, name: string) =>
  fd.get(name) === "on" || fd.get(name) === "true";

/** Ejecuta un servicio con el contexto de la sesión y revalida las rutas indicadas. */
export async function act(
  paths: string[],
  fn: (ctx: ServiceContext) => Promise<unknown>,
): Promise<ActionResult> {
  return runAction(async () => {
    await fn(await getServiceContext());
    for (const p of paths) revalidatePath(p);
    revalidatePath("/calidad", "layout");
    revalidatePath("/inicio");
    return undefined;
  });
}
