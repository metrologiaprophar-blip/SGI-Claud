"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, parseForm, runAction } from "@/server/action";
import { updateOrganization } from "./service";

const schema = z.object({
  name: z.string().trim().min(2, "too_short").max(160, "too_long"),
  taxId: z
    .string()
    .trim()
    .max(20, "too_long")
    .optional()
    .transform((v) => v || null),
  timezone: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "invalid_timezone"),
  passwordMaxAgeDays: z.coerce.number().int().min(30, "out_of_range").max(365, "out_of_range"),
  sessionIdleMinutes: z.coerce.number().int().min(5, "out_of_range").max(240, "out_of_range"),
  reason: z.string().trim().min(3, "reason_required").max(500, "too_long"),
});

export async function updateOrganizationAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(schema, formData);
  if (!parsed.success) return parsed.error;
  return runAction(async () => {
    const ctx = await getServiceContext("ADMIN_EMPRESA", "SUPER_ADMIN");
    const { reason, ...input } = parsed.data;
    await updateOrganization(ctx, input, reason);
    revalidatePath("/admin/empresa");
    return undefined;
  });
}
