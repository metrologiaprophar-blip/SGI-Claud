import { z } from "zod";

export const loginSchema = z.object({
  organizationCode: z.string().trim().min(1, "required").max(32, "too_long"),
  username: z.string().trim().min(1, "required").max(48, "too_long"),
  password: z.string().min(1, "required").max(128, "too_long"),
  callbackUrl: z.string().optional(),
});

export const forgotPasswordSchema = z.object({
  organizationCode: z.string().trim().min(1, "required").max(32, "too_long"),
  username: z.string().trim().min(1, "required").max(48, "too_long"),
  note: z.string().max(500, "too_long").optional(),
});
