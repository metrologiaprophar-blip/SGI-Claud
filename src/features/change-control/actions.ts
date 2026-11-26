"use server";

import { redirect } from "next/navigation";
import type { ChangeType, Classification, RiskLevel } from "@prisma/client";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, runAction } from "@/server/action";
import { act, field, optional } from "../quality/form";
import {
  cancelChange,
  closeChange,
  createChange,
  decideChange,
  markImplemented,
  saveAssessment,
  submitChange,
  updateChangeDraft,
  type ChangeInput,
} from "./service";

const path = (id: string) => `/calidad/control-cambios/${id}`;

const readChange = (fd: FormData): ChangeInput => ({
  title: field(fd, "title"),
  description: field(fd, "description"),
  justification: field(fd, "justification"),
  changeType: field(fd, "changeType") as ChangeType,
  processId: field(fd, "processId"),
  affectedItems: optional(fd, "affectedItems"),
  plannedDate: optional(fd, "plannedDate"),
});

export async function createChangeAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    createChange(await getServiceContext(), readChange(fd)),
  );
  if (!result.ok) return result;
  redirect(path(result.data.id));
}

export async function updateChangeAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => updateChangeDraft(ctx, id, readChange(fd)));
}

export async function submitChangeAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => submitChange(ctx, id, String(fd.get("password") ?? "")));
}

export async function saveAssessmentAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    saveAssessment(ctx, id, {
      classification: field(fd, "classification") as Classification,
      riskLevel: field(fd, "riskLevel") as RiskLevel,
      regulatoryNotification: field(fd, "regulatoryNotification") === "yes",
      impactQuality: field(fd, "impactQuality"),
      impactValidation: optional(fd, "impactValidation"),
      impactDocuments: optional(fd, "impactDocuments"),
      impactTraining: optional(fd, "impactTraining"),
    }),
  );
}

export async function decideChangeAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  const decision = field(fd, "decision");
  return act([path(id)], (ctx) =>
    decideChange(ctx, id, {
      decision: decision === "reject" ? "reject" : decision === "return" ? "return" : "approve",
      comment: field(fd, "comment"),
      password: String(fd.get("password") ?? ""),
    }),
  );
}

export async function markImplementedAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => markImplemented(ctx, id));
}

export async function closeChangeAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    closeChange(ctx, id, field(fd, "comment"), String(fd.get("password") ?? "")),
  );
}

export async function cancelChangeAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => cancelChange(ctx, id, field(fd, "reason")));
}
