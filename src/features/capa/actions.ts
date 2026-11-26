"use server";

import { redirect } from "next/navigation";
import type { CapaSource, CapaType } from "@prisma/client";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, runAction } from "@/server/action";
import { act, field, optional } from "../quality/form";
import {
  approveCapaPlan,
  cancelCapa,
  createCapa,
  requestEffectivenessCheck,
  verifyEffectiveness,
} from "./service";

const path = (id: string) => `/calidad/capa/${id}`;

export async function createCapaAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    createCapa(await getServiceContext(), {
      title: field(fd, "title"),
      source: field(fd, "source") as CapaSource,
      deviationId: optional(fd, "deviationId"),
      sourceReference: optional(fd, "sourceReference"),
      problemStatement: field(fd, "problemStatement"),
      rootCause: optional(fd, "rootCause"),
      type: field(fd, "type") as CapaType,
      ownerId: field(fd, "ownerId"),
      effectivenessCriteria: field(fd, "effectivenessCriteria"),
      targetDate: field(fd, "targetDate"),
    }),
  );
  if (!result.ok) return result;
  redirect(path(result.data.id));
}

export async function approveCapaPlanAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    approveCapaPlan(ctx, id, {
      decision: field(fd, "decision") === "reject" ? "reject" : "approve",
      comment: field(fd, "comment"),
      password: String(fd.get("password") ?? ""),
    }),
  );
}

export async function requestEffectivenessAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    requestEffectivenessCheck(ctx, id, field(fd, "effectivenessDueDate") || undefined),
  );
}

export async function verifyEffectivenessAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    verifyEffectiveness(ctx, id, {
      decision: field(fd, "decision") === "not_effective" ? "not_effective" : "effective",
      result: field(fd, "result"),
      password: String(fd.get("password") ?? ""),
    }),
  );
}

export async function cancelCapaAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => cancelCapa(ctx, id, field(fd, "reason")));
}
