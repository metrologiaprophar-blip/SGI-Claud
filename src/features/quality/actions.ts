"use server";

import type { ActionResult } from "@/lib/result";
import { addAction, cancelAction, completeAction } from "./actions-service";
import { act, field } from "./form";

/** Añade una acción a una CAPA o a un control de cambios (según el campo oculto presente). */
export async function addActionAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const capaId = field(fd, "capaId");
  const changeControlId = field(fd, "changeControlId");
  const input = {
    description: field(fd, "description"),
    responsibleId: field(fd, "responsibleId"),
    dueDate: field(fd, "dueDate"),
  };
  return act([field(fd, "path")], (ctx) =>
    addAction(ctx, capaId ? { capaId } : { changeControlId }, input),
  );
}

export async function completeActionAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return act([field(fd, "path")], (ctx) =>
    completeAction(ctx, field(fd, "actionId"), field(fd, "evidence")),
  );
}

export async function cancelActionAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  return act([field(fd, "path")], (ctx) =>
    cancelAction(ctx, field(fd, "actionId"), field(fd, "reason")),
  );
}
