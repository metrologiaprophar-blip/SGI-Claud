"use server";

import { redirect } from "next/navigation";
import type { Classification, DeviationCategory, RootCauseMethod } from "@prisma/client";
import type { ActionResult } from "@/lib/result";
import { getServiceContext, runAction } from "@/server/action";
import { act, checked, field, optional } from "../quality/form";
import {
  closeDeviation,
  dismissDeviation,
  reportDeviation,
  saveInvestigation,
  submitInvestigation,
  triageDeviation,
} from "./service";

const path = (id: string) => `/calidad/desviaciones/${id}`;

export async function reportDeviationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    reportDeviation(await getServiceContext(), {
      title: field(fd, "title"),
      description: field(fd, "description"),
      category: field(fd, "category") as DeviationCategory,
      processId: field(fd, "processId"),
      location: optional(fd, "location"),
      detectedAt: field(fd, "detectedAt"),
      batches: optional(fd, "batches"),
      immediateAction: field(fd, "immediateAction"),
    }),
  );
  if (!result.ok) return result;
  redirect(path(result.data.id));
}

export async function triageDeviationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    triageDeviation(ctx, id, {
      classification: field(fd, "classification") as Classification,
      investigatorId: field(fd, "investigatorId"),
      dueDate: field(fd, "dueDate") || undefined,
      capaRequired: checked(fd, "capaRequired"),
      comment: field(fd, "comment"),
    }),
  );
}

export async function dismissDeviationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => dismissDeviation(ctx, id, field(fd, "reason")));
}

export async function saveInvestigationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    saveInvestigation(ctx, id, {
      rootCauseMethod: (field(fd, "rootCauseMethod") || null) as RootCauseMethod | null,
      rootCause: optional(fd, "rootCause"),
      impactAssessment: optional(fd, "impactAssessment"),
      productDisposition: optional(fd, "productDisposition"),
      conclusion: optional(fd, "conclusion"),
    }),
  );
}

export async function submitInvestigationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) => submitInvestigation(ctx, id, String(fd.get("password") ?? "")));
}

export async function closeDeviationAction(
  _prev: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([path(id)], (ctx) =>
    closeDeviation(ctx, id, {
      decision: field(fd, "decision") === "reject" ? "reject" : "approve",
      comment: field(fd, "comment"),
      password: String(fd.get("password") ?? ""),
    }),
  );
}
