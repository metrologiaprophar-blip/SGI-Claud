"use server";

import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, runAction } from "@/server/action";
import { approveResetRequest, rejectResetRequest } from "./service";

const ADMIN_ROLES = ["ADMIN_EMPRESA", "SUPER_ADMIN"] as const;

export async function approveResetRequestAction(
  id: string,
  note?: string,
): Promise<ActionResult<{ username: string; fullName: string; temporaryPassword: string }>> {
  return runAction(async () => {
    const ctx = await getServiceContext(...ADMIN_ROLES);
    const result = await approveResetRequest(ctx, id, note?.slice(0, 500));
    revalidatePath("/admin", "layout");
    return result;
  });
}

export async function rejectResetRequestAction(id: string, note: string): Promise<ActionResult> {
  return runAction(async () => {
    const ctx = await getServiceContext(...ADMIN_ROLES);
    await rejectResetRequest(ctx, id, note.slice(0, 500));
    revalidatePath("/admin", "layout");
    return undefined;
  });
}
