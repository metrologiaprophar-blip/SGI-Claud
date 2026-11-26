"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";
import { fail, ok, type ActionResult } from "@/lib/result";
import { parseForm } from "@/server/action";
import { getRequestInfo } from "@/server/request-info";
import { requestPasswordReset } from "@/server/public/password-reset";
import { mustChangePasswordFor } from "@/server/auth/authenticate";
import { forgotPasswordSchema, loginSchema } from "./schemas";

/** Solo rutas internas como destino tras el login (evita redirecciones abiertas). */
function safeCallback(url?: string) {
  return url && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/login")
    ? url
    : "/inicio";
}

export async function loginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.success) return parsed.error;
  const { organizationCode, username, password, callbackUrl } = parsed.data;
  try {
    await signIn("credentials", { organizationCode, username, password, redirect: false });
  } catch (e) {
    if (e instanceof AuthError) return fail("invalid_credentials", "Invalid credentials");
    throw e;
  }
  const mustChange = await mustChangePasswordFor(organizationCode, username);
  redirect(mustChange ? "/cambiar-clave" : safeCallback(callbackUrl));
}

/** Siempre devuelve el mismo resultado para no revelar si la cuenta existe (PRD §3.5). */
export async function forgotPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(forgotPasswordSchema, formData);
  if (!parsed.success) return parsed.error;
  try {
    await requestPasswordReset(parsed.data, await getRequestInfo());
  } catch (e) {
    console.error("[forgot-password]", e);
  }
  return ok(undefined);
}

/** Cierre de sesión por formulario POST (protegido contra CSRF por las Server Actions). */
export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
