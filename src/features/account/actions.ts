"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth, unstable_update } from "@/auth";
import { isLocale, LOCALE_COOKIE } from "@/i18n/config";
import type { ActionResult } from "@/lib/result";
import { fail, ok } from "@/lib/result";
import { getServiceContextAllowingPasswordChange, parseForm, runAction } from "@/server/action";
import { changeOwnPassword, setOwnLocale } from "./service";

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "required"),
    newPassword: z.string().min(1, "required").max(128, "too_long"),
    confirmPassword: z.string().min(1, "required"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "passwords_dont_match",
  });

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(changePasswordSchema, formData);
  if (!parsed.success) return parsed.error;
  const result = await runAction(async () => {
    const ctx = await getServiceContextAllowingPasswordChange();
    await changeOwnPassword(ctx, parsed.data.currentPassword, parsed.data.newPassword);
  });
  if (!result.ok) return result;
  await unstable_update({}); // recarga el token desde la BD (nueva fecha de clave, sin cambio obligatorio)
  redirect("/inicio?clave=actualizada");
}

/** Cambia el idioma del dispositivo y, si hay sesión, la preferencia del usuario. */
export async function setLocaleAction(locale: string): Promise<ActionResult> {
  if (!isLocale(locale)) return fail("validation", "Invalid locale");
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 365 * 86_400,
    sameSite: "lax",
  });
  const session = await auth();
  if (session?.user?.id) {
    const ctx = await getServiceContextAllowingPasswordChange();
    await setOwnLocale(ctx, locale);
    await unstable_update({});
  }
  return ok(undefined);
}
