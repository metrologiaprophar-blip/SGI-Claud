import { unstable_rethrow } from "next/navigation";
import type { Role } from "@prisma/client";
import type { z } from "zod";
import { ServiceError } from "@/lib/errors";
import { fail, ok, type ActionResult } from "@/lib/result";
import { requireRole, requireSession, requireSessionAllowingPasswordChange } from "./auth/guards";
import { createTenantClient } from "./db/tenant-client";
import { prisma } from "./db/client";
import { getTenantDb } from "./db/tenant";
import { getRequestInfo } from "./request-info";
import type { ServiceContext } from "./context";

/** Contexto de servicio a partir de la sesión (con comprobación de rol opcional). */
export async function getServiceContext(...roles: Role[]): Promise<ServiceContext> {
  const session = roles.length ? await requireRole(...roles) : await requireSession();
  return buildContext(session, await getTenantDb());
}

/** Contexto para las únicas acciones permitidas con cambio de clave pendiente (clave propia, idioma). */
export async function getServiceContextAllowingPasswordChange(): Promise<ServiceContext> {
  const session = await requireSessionAllowingPasswordChange();
  return buildContext(session, createTenantClient(prisma, session.user.organizationId));
}

async function buildContext(
  session: Awaited<ReturnType<typeof requireSession>>,
  db: ServiceContext["db"],
): Promise<ServiceContext> {
  return {
    db,
    actor: {
      id: session.user.id,
      name: session.user.fullName,
      role: session.user.role,
      organizationId: session.user.organizationId,
    },
    req: await getRequestInfo(),
  };
}

/** Ejecuta una acción y convierte los errores de negocio en ActionResult. */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await fn());
  } catch (e) {
    unstable_rethrow(e); // redirect(), notFound()…
    if (e instanceof ServiceError) return fail(e.code, e.message);
    console.error("[action] error inesperado", e);
    return fail("unexpected", "Unexpected error");
  }
}

/** Valida FormData con un esquema Zod; devuelve errores por campo (códigos i18n). */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): { success: true; data: z.infer<S> } | { success: false; error: ActionResult<never> } {
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse(raw);
  if (parsed.success) return { success: true, data: parsed.data as z.infer<S> };
  const fields: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fields[key] ??= issue.message;
  }
  return { success: false, error: fail("validation", "Invalid input", fields) };
}
