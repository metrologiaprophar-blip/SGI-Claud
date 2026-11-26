"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/result";
import { getServiceContext, parseForm, runAction } from "@/server/action";
import { STANDARDS } from "@/config/navigation";
import {
  acknowledgeRead,
  approveVersion,
  cancelDraft,
  createDocument,
  createNewVersion,
  obsoleteDocument,
  reviewVersion,
  submitForReview,
  uploadDraftFile,
} from "./service";

const DOC_TYPES = [
  "MANUAL",
  "POLICY",
  "SOP",
  "INSTRUCTION",
  "SPECIFICATION",
  "FORM",
  "PLAN",
  "OTHER",
] as const;
const docPath = (id: string) => `/documentos/doc/${id}`;

const createSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._-]{1,39}$/, "invalid_document_code"),
  title: z.string().trim().min(3, "too_short").max(200, "too_long"),
  type: z.enum(DOC_TYPES),
  processId: z.string().min(1, "required"),
  ownerId: z.string().optional(),
  reviewPeriodMonths: z.coerce.number().int().min(6, "out_of_range").max(60, "out_of_range"),
  changeSummary: z.string().trim().max(1000, "too_long").optional().default(""),
});

export async function createDocumentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(createSchema, formData);
  if (!parsed.success) return parsed.error;
  const standards = formData
    .getAll("standards")
    .map(String)
    .filter((s) => (STANDARDS as string[]).includes(s));
  const result = await runAction(async () => {
    const ctx = await getServiceContext();
    return createDocument(ctx, { ...parsed.data, standards });
  });
  if (!result.ok) return result;
  revalidatePath("/documentos", "layout");
  redirect(docPath(result.data.document.id));
}

export async function createNewVersionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const documentId = String(formData.get("documentId") ?? "");
  const summary = String(formData.get("changeSummary") ?? "");
  const result = await runAction(async () =>
    createNewVersion(await getServiceContext(), documentId, summary),
  );
  if (!result.ok) return result;
  revalidatePath(docPath(documentId));
  return { ok: true, data: undefined };
}

export async function uploadFileAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const versionId = String(formData.get("versionId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("file_required", "File required");
  const data = Buffer.from(await file.arrayBuffer());
  return runAction(async () => {
    await uploadDraftFile(await getServiceContext(), versionId, file.name, data);
    revalidatePath(docPath(documentId));
    return undefined;
  });
}

const submitSchema = z.object({
  versionId: z.string().min(1),
  documentId: z.string().min(1),
  reviewerId: z.string().min(1, "required"),
  approverId: z.string().min(1, "required"),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "required"),
  changeSummary: z.string().trim().max(1000, "too_long").optional().default(""),
  password: z.string().min(1, "required"),
});

export async function submitForReviewAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(submitSchema, formData);
  if (!parsed.success) return parsed.error;
  const { versionId, documentId, ...input } = parsed.data;
  const readerIds = formData.getAll("readerIds").map(String);
  return runAction(async () => {
    await submitForReview(await getServiceContext(), versionId, { ...input, readerIds });
    revalidatePath(docPath(documentId));
    revalidatePath("/documentos", "layout");
    return undefined;
  });
}

const decisionSchema = z.object({
  versionId: z.string().min(1),
  documentId: z.string().min(1),
  stage: z.enum(["review", "approval"]),
  decision: z.enum(["approve", "reject"]),
  comment: z.string().trim().max(1000, "too_long").optional().default(""),
  password: z.string().min(1, "required"),
});

export async function decisionAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseForm(decisionSchema, formData);
  if (!parsed.success) return parsed.error;
  const { versionId, documentId, stage, ...input } = parsed.data;
  return runAction(async () => {
    const ctx = await getServiceContext();
    if (stage === "review") await reviewVersion(ctx, versionId, input);
    else await approveVersion(ctx, versionId, input);
    revalidatePath(docPath(documentId));
    revalidatePath("/documentos", "layout");
    return undefined;
  });
}

export async function acknowledgeReadAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const versionId = String(formData.get("versionId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!password) return fail("validation", "Invalid input", { password: "required" });
  return runAction(async () => {
    await acknowledgeRead(await getServiceContext(), versionId, password);
    revalidatePath(docPath(documentId));
    revalidatePath("/documentos", "layout");
    return undefined;
  });
}

export async function cancelDraftAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const versionId = String(formData.get("versionId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  return runAction(async () => {
    await cancelDraft(await getServiceContext(), versionId, reason);
    revalidatePath(docPath(documentId));
    return undefined;
  });
}

export async function obsoleteDocumentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const documentId = String(formData.get("documentId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!password) return fail("validation", "Invalid input", { password: "required" });
  return runAction(async () => {
    await obsoleteDocument(await getServiceContext(), documentId, reason, password);
    revalidatePath(docPath(documentId));
    revalidatePath("/documentos", "layout");
    return undefined;
  });
}
