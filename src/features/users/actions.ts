"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { USERNAME_PATTERN } from "@/lib/identity";
import { parsePermissions } from "@/lib/permissions";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, parseForm, runAction } from "@/server/action";
import { createUser, resetUserPassword, unlockUser, updateUser } from "./service";

const ADMIN_ROLES = ["ADMIN_EMPRESA", "SUPER_ADMIN"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "too_long")
    .optional()
    .transform((v) => v || null);

const createSchema = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN, "invalid_username"),
  fullName: z.string().trim().min(3, "too_short").max(120, "too_long"),
  email: z
    .union([z.literal(""), z.email("invalid_email")])
    .optional()
    .transform((v) => v || null),
  jobTitle: optionalText(120),
  role: z.enum(["ADMIN_EMPRESA", "USUARIO"]),
});

const updateSchema = z.object({
  id: z.string().min(1),
  fullName: z.string().trim().min(3, "too_short").max(120, "too_long"),
  email: z
    .union([z.literal(""), z.email("invalid_email")])
    .optional()
    .transform((v) => v || null),
  jobTitle: optionalText(120),
  role: z.enum(["SUPER_ADMIN", "ADMIN_EMPRESA", "USUARIO"]),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: optionalText(500),
});

export async function createUserAction(
  _prev: ActionResult<{ username: string; temporaryPassword: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ username: string; temporaryPassword: string }>> {
  const parsed = parseForm(createSchema, formData);
  if (!parsed.success) return parsed.error;
  return runAction(async () => {
    const ctx = await getServiceContext(...ADMIN_ROLES);
    const { user, temporaryPassword } = await createUser(ctx, parsed.data);
    revalidatePath("/admin/usuarios");
    return { username: user.username, temporaryPassword };
  });
}

export async function updateUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(updateSchema, formData);
  if (!parsed.success) return parsed.error;
  return runAction(async () => {
    const ctx = await getServiceContext(...ADMIN_ROLES);
    const { id, reason, ...input } = parsed.data;
    const permissions = parsePermissions(formData.getAll("permissions").map(String));
    await updateUser(ctx, id, { ...input, permissions }, reason ?? undefined);
    revalidatePath("/admin/usuarios");
    return undefined;
  });
}

export async function resetUserPasswordAction(
  userId: string,
): Promise<ActionResult<{ username: string; temporaryPassword: string }>> {
  return runAction(async () => {
    const ctx = await getServiceContext(...ADMIN_ROLES);
    const result = await resetUserPassword(ctx, userId);
    revalidatePath("/admin/usuarios");
    return result;
  });
}

export async function unlockUserAction(userId: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await getServiceContext(...ADMIN_ROLES);
    await unlockUser(ctx, userId);
    revalidatePath("/admin/usuarios");
    return undefined;
  });
}
