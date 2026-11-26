import { Prisma, type DocumentType, type VersionStatus } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { addDays, addMonths, startOfDayInZone, todayInZone } from "@/lib/dates";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import { hasPermission, permissionsOf, requirePermission } from "@/server/permissions";
import { recordSignature, verifySigner } from "@/server/signatures";
import { checkFile, readStoredFile, saveFile, sha256 } from "@/server/storage";
import type { TenantDb } from "@/server/db/tenant-client";

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

export const OPEN_STATUSES: VersionStatus[] = [
  "DRAFT",
  "IN_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
];
export const DOCUMENT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
/** Plazo para la lectura obligatoria tras la entrada en vigencia. */
export const READ_DUE_DAYS = 15;

const ENTITY = "DocumentVersion";

// ───────────────────────────── Consultas ─────────────────────────────

export function listProcesses(db: TenantDb) {
  return db.process.findMany({ where: { active: true }, orderBy: { code: "asc" } });
}

/** Usuarios activos para asignar revisor, aprobador y lectores. */
export async function listAssignableUsers(db: TenantDb) {
  const users = await db.user.findMany({
    where: { status: "ACTIVE", role: { not: "SUPER_ADMIN" } },
    select: { id: true, fullName: true, jobTitle: true, permissions: true },
    orderBy: { fullName: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    jobTitle: u.jobTitle,
    canApprove: Array.isArray(u.permissions) && u.permissions.includes("DOC_APPROVE"),
  }));
}

export type DocumentFilter = {
  type?: DocumentType;
  types?: DocumentType[];
  processId?: string;
  q?: string;
  standard?: string;
  includeObsolete?: boolean;
};

/** Listado maestro: cada documento con su versión vigente y la versión en curso. */
export async function listDocuments(db: TenantDb, filter: DocumentFilter = {}) {
  await promoteDueVersions(db);
  const q = filter.q?.trim();
  const docs = await db.document.findMany({
    where: {
      ...(filter.type ? { type: filter.type } : filter.types ? { type: { in: filter.types } } : {}),
      ...(filter.processId ? { processId: filter.processId } : {}),
      ...(filter.includeObsolete ? {} : { status: "ACTIVE" }),
      ...(q ? { OR: [{ code: { contains: q.toUpperCase() } }, { title: { contains: q } }] } : {}),
    },
    include: {
      process: { select: { code: true, name: true } },
      owner: { select: { fullName: true } },
      versions: {
        where: { status: { in: ["EFFECTIVE", "OBSOLETE", ...OPEN_STATUSES] } },
        orderBy: { version: "desc" },
        select: {
          id: true,
          version: true,
          status: true,
          effectiveDate: true,
          nextReviewDate: true,
        },
      },
    },
    orderBy: { code: "asc" },
  });
  return docs
    .filter(
      (d) =>
        !filter.standard || (Array.isArray(d.standards) && d.standards.includes(filter.standard)),
    )
    .map((d) => ({
      ...d,
      current: d.versions.find((v) => v.status === "EFFECTIVE" || v.status === "OBSOLETE") ?? null,
      inProgress: d.versions.find((v) => OPEN_STATUSES.includes(v.status)) ?? null,
    }));
}

export async function getDocument(db: TenantDb, documentId: string) {
  await promoteDueVersions(db);
  const doc = await db.document.findUnique({
    where: { id: documentId },
    include: {
      process: true,
      owner: { select: { id: true, fullName: true } },
      versions: {
        orderBy: { version: "desc" },
        include: {
          author: { select: { id: true, fullName: true } },
          reviewer: { select: { id: true, fullName: true } },
          approver: { select: { id: true, fullName: true } },
          reads: { select: { userId: true, acknowledgedAt: true, dueDate: true } },
        },
      },
    },
  });
  if (!doc) return null;
  const signatures = await db.electronicSignature.findMany({
    where: { entityType: ENTITY, entityId: { in: doc.versions.map((v) => v.id) } },
    orderBy: { signedAt: "asc" },
  });
  return { ...doc, signatures };
}

// ───────────────────────────── Altas ─────────────────────────────

export type CreateDocumentInput = {
  code: string;
  title: string;
  type: DocumentType;
  processId: string;
  ownerId?: string;
  standards: string[];
  reviewPeriodMonths: number;
  changeSummary: string;
};

/** Alta de un documento con su versión 1 en borrador (requiere DOC_MANAGE). */
export async function createDocument(ctx: ServiceContext, input: CreateDocumentInput) {
  await requirePermission(ctx, "DOC_MANAGE");
  const code = input.code.trim().toUpperCase();
  if (!DOCUMENT_CODE_PATTERN.test(code)) throw new ServiceError("invalid_document_code");
  // Las referencias se validan con el cliente de la empresa: un id de otra empresa no existe aquí.
  if (!(await ctx.db.process.findUnique({ where: { id: input.processId } })))
    throw new ServiceError("not_found");
  const ownerId = input.ownerId || ctx.actor.id;
  const owner = await ctx.db.user.findUnique({ where: { id: ownerId } });
  if (!owner || owner.status !== "ACTIVE") throw new ServiceError("invalid_user");

  try {
    return await ctx.db.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          organizationId: ctx.actor.organizationId,
          code,
          title: input.title.trim(),
          type: input.type,
          processId: input.processId,
          ownerId,
          standards: input.standards,
          reviewPeriodMonths: input.reviewPeriodMonths,
          createdById: ctx.actor.id,
        },
      });
      const version = await tx.documentVersion.create({
        data: {
          organizationId: ctx.actor.organizationId,
          documentId: doc.id,
          version: 1,
          changeSummary: input.changeSummary.trim() || "Emisión inicial",
          authorId: ctx.actor.id,
        },
      });
      await logAudit(
        {
          ...auditBase(ctx),
          action: "document.create",
          entityType: "Document",
          entityId: doc.id,
          after: {
            code,
            title: doc.title,
            type: doc.type,
            processId: doc.processId,
            ownerId,
            standards: input.standards,
            version: 1,
          },
        },
        tx,
      );
      return { document: doc, version };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw new ServiceError("document_code_taken");
    throw e;
  }
}

/** Nueva versión (revisión) de un documento vigente: la elabora el dueño o el control documental. */
export async function createNewVersion(
  ctx: ServiceContext,
  documentId: string,
  changeSummary: string,
) {
  if (changeSummary.trim().length < 5) throw new ServiceError("change_summary_required");
  const doc = await ctx.db.document.findUnique({
    where: { id: documentId },
    include: { versions: true },
  });
  if (!doc) throw new ServiceError("not_found");
  if (doc.status !== "ACTIVE") throw new ServiceError("document_obsolete");
  if (doc.ownerId !== ctx.actor.id && !(await hasPermission(ctx, "DOC_MANAGE")))
    throw new ServiceError("forbidden");
  if (doc.versions.some((v) => OPEN_STATUSES.includes(v.status)))
    throw new ServiceError("version_in_progress");
  const next = Math.max(0, ...doc.versions.map((v) => v.version)) + 1;
  return ctx.db.$transaction(async (tx) => {
    const version = await tx.documentVersion.create({
      data: {
        organizationId: ctx.actor.organizationId,
        documentId,
        version: next,
        changeSummary: changeSummary.trim(),
        authorId: ctx.actor.id,
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "document.version.create",
        entityType: ENTITY,
        entityId: version.id,
        after: { documentId, version: next, changeSummary },
      },
      tx,
    );
    return version;
  });
}

// ───────────────────────────── Borrador ─────────────────────────────

async function loadVersion(db: TenantDb | Tx, versionId: string) {
  const version = await db.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  });
  if (!version) throw new ServiceError("not_found");
  return version;
}

/** Sube o reemplaza el archivo de un borrador (solo su autor). */
export async function uploadDraftFile(
  ctx: ServiceContext,
  versionId: string,
  fileName: string,
  data: Buffer,
) {
  const version = await loadVersion(ctx.db, versionId);
  if (version.authorId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (version.status !== "DRAFT") throw new ServiceError("version_not_editable");
  const check = checkFile(fileName, data);
  if ("error" in check) throw new ServiceError(check.error);
  const stored = await saveFile(ctx.actor.organizationId, fileName, data);
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.documentVersion.update({
      where: { id: versionId },
      data: {
        fileName: stored.fileName,
        fileMime: stored.mime,
        fileSize: stored.size,
        fileSha256: stored.sha256,
        storageKey: stored.storageKey,
      },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "document.file.upload",
        entityType: ENTITY,
        entityId: versionId,
        before: version.fileSha256
          ? { fileName: version.fileName, fileSha256: version.fileSha256 }
          : undefined,
        after: { fileName: stored.fileName, fileSha256: stored.sha256, fileSize: stored.size },
      },
      tx,
    );
    return updated;
  });
}

export type SubmitInput = {
  reviewerId: string;
  approverId: string;
  readerIds: string[];
  effectiveDate: string; // AAAA-MM-DD
  changeSummary: string;
  password: string;
};

/** El autor firma (ELABORÓ) y envía a revisión. A partir de aquí el contenido no cambia. */
export async function submitForReview(ctx: ServiceContext, versionId: string, input: SubmitInput) {
  const version = await loadVersion(ctx.db, versionId);
  if (version.authorId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (version.status !== "DRAFT") throw new ServiceError("version_not_editable");
  if (!version.fileSha256 || !version.storageKey) throw new ServiceError("file_required");
  if (version.version > 1 && input.changeSummary.trim().length < 5)
    throw new ServiceError("change_summary_required");

  // Segregación de funciones: autor, revisor y aprobador son tres personas distintas.
  const ids = new Set([ctx.actor.id, input.reviewerId, input.approverId]);
  if (ids.size !== 3) throw new ServiceError("segregation_of_duties");
  const [reviewer, approver] = await Promise.all([
    ctx.db.user.findUnique({ where: { id: input.reviewerId } }),
    ctx.db.user.findUnique({ where: { id: input.approverId } }),
  ]);
  if (!reviewer || reviewer.status !== "ACTIVE" || !approver || approver.status !== "ACTIVE")
    throw new ServiceError("invalid_user");
  if (!(await permissionsOf(ctx.db, approver.id)).includes("DOC_APPROVE"))
    throw new ServiceError("approver_without_permission");
  const readerIds = [...new Set(input.readerIds)];
  if (readerIds.length) {
    const found = await ctx.db.user.count({ where: { id: { in: readerIds }, status: "ACTIVE" } });
    if (found !== readerIds.length) throw new ServiceError("invalid_user");
  }

  const org = await ctx.db.organization.findUnique({ where: { id: ctx.actor.organizationId } });
  const timezone = org?.timezone ?? "America/Guayaquil";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) ||
    input.effectiveDate < todayInZone(timezone)
  ) {
    throw new ServiceError("invalid_effective_date");
  }
  const effectiveDate = startOfDayInZone(input.effectiveDate, timezone);

  const signer = await verifySigner(ctx, input.password, {
    meaning: "AUTHORED",
    entityType: ENTITY,
    entityId: versionId,
  });
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.documentVersion.update({
      where: { id: versionId },
      data: {
        status: "IN_REVIEW",
        reviewerId: reviewer.id,
        approverId: approver.id,
        readerIds,
        effectiveDate,
        changeSummary: input.changeSummary.trim() || version.changeSummary,
        submittedAt: new Date(),
        lastRejection: null,
      },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "AUTHORED",
      entityType: ENTITY,
      entityId: versionId,
      contentHash: version.fileSha256,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "document.submit",
        entityType: ENTITY,
        entityId: versionId,
        before: { status: "DRAFT" },
        after: {
          status: "IN_REVIEW",
          reviewerId: reviewer.id,
          approverId: approver.id,
          readers: readerIds.length,
          effectiveDate,
        },
      },
      tx,
    );
    return updated;
  });
}

export type DecisionInput = { decision: "approve" | "reject"; comment?: string; password: string };

/** El revisor firma REVISÓ (pasa a aprobación) o RECHAZÓ (vuelve a borrador con su comentario). */
export async function reviewVersion(ctx: ServiceContext, versionId: string, input: DecisionInput) {
  const version = await loadVersion(ctx.db, versionId);
  if (version.reviewerId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (version.status !== "IN_REVIEW") throw new ServiceError("version_not_in_review");
  return decide(
    ctx,
    version,
    input,
    "REVIEWED",
    { status: "PENDING_APPROVAL", reviewedAt: new Date() },
    "document.review",
  );
}

/** El aprobador firma APROBÓ (entra en vigencia en la fecha prevista) o RECHAZÓ. */
export async function approveVersion(ctx: ServiceContext, versionId: string, input: DecisionInput) {
  const version = await loadVersion(ctx.db, versionId);
  if (version.approverId !== ctx.actor.id) throw new ServiceError("forbidden");
  if (version.status !== "PENDING_APPROVAL") throw new ServiceError("version_not_pending_approval");
  if (input.decision === "approve") await requirePermission(ctx, "DOC_APPROVE");
  return decide(
    ctx,
    version,
    input,
    "APPROVED",
    { status: "APPROVED", approvedAt: new Date() },
    "document.approve",
  );
}

async function decide(
  ctx: ServiceContext,
  version: Awaited<ReturnType<typeof loadVersion>>,
  input: DecisionInput,
  meaning: "REVIEWED" | "APPROVED",
  approveData: Prisma.DocumentVersionUncheckedUpdateInput,
  action: string,
) {
  const reject = input.decision === "reject";
  if (reject && (input.comment?.trim().length ?? 0) < 5) throw new ServiceError("reason_required");
  const signer = await verifySigner(ctx, input.password, {
    meaning: reject ? "REJECTED" : meaning,
    entityType: ENTITY,
    entityId: version.id,
  });
  return ctx.db.$transaction(async (tx) => {
    // Revalida el estado dentro de la transacción (evita dobles firmas simultáneas).
    const fresh = await tx.documentVersion.findUnique({ where: { id: version.id } });
    if (!fresh || fresh.status !== version.status) throw new ServiceError("version_state_changed");
    const data: Prisma.DocumentVersionUncheckedUpdateInput = reject
      ? {
          status: "DRAFT",
          lastRejection: input.comment!.trim(),
          reviewedAt: null,
          approvedAt: null,
        }
      : approveData;
    let updated = await tx.documentVersion.update({ where: { id: version.id }, data });
    await recordSignature(ctx, tx, signer, {
      meaning: reject ? "REJECTED" : meaning,
      entityType: ENTITY,
      entityId: version.id,
      contentHash: version.fileSha256,
      comment: input.comment,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: reject ? `${action}_reject` : action,
        entityType: ENTITY,
        entityId: version.id,
        before: { status: version.status },
        after: { status: updated.status },
        reason: input.comment,
      },
      tx,
    );
    if (
      !reject &&
      updated.status === "APPROVED" &&
      updated.effectiveDate &&
      updated.effectiveDate <= new Date()
    ) {
      updated = await activate(tx, updated.id, auditBase(ctx));
    }
    return updated;
  });
}

// ───────────────────────────── Vigencia ─────────────────────────────

/** Pone en vigencia una versión aprobada: sustituye a la anterior y genera la lectura obligatoria. */
async function activate(tx: Tx, versionId: string, audit: ReturnType<typeof auditBase>) {
  const version = await tx.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: true },
  });
  if (!version || version.status !== "APPROVED") throw new ServiceError("version_state_changed");
  const now = new Date();
  const previous = await tx.documentVersion.findMany({
    where: { documentId: version.documentId, status: "EFFECTIVE" },
  });
  for (const prev of previous) {
    await tx.documentVersion.update({
      where: { id: prev.id },
      data: { status: "SUPERSEDED", supersededAt: now },
    });
    await logAudit(
      {
        ...audit,
        action: "document.supersede",
        entityType: ENTITY,
        entityId: prev.id,
        before: { status: "EFFECTIVE" },
        after: { status: "SUPERSEDED", by: version.id },
      },
      tx,
    );
  }
  const base = version.effectiveDate ?? now;
  const updated = await tx.documentVersion.update({
    where: { id: versionId },
    data: {
      status: "EFFECTIVE",
      effectiveAt: now,
      nextReviewDate: addMonths(base, version.document.reviewPeriodMonths),
    },
  });
  const readerIds = Array.isArray(version.readerIds) ? (version.readerIds as string[]) : [];
  if (readerIds.length) {
    await tx.readAcknowledgement.createMany({
      data: readerIds.map((userId) => ({
        organizationId: version.organizationId,
        versionId,
        userId,
        dueDate: addDays(now, READ_DUE_DAYS),
      })),
    });
  }
  await logAudit(
    {
      ...audit,
      action: "document.effective",
      entityType: ENTITY,
      entityId: versionId,
      before: { status: "APPROVED" },
      after: { status: "EFFECTIVE", readers: readerIds.length },
    },
    tx,
  );
  return updated;
}

/** Versiones aprobadas cuya fecha de vigencia ya llegó → vigentes. Se ejecuta al consultar. */
export async function promoteDueVersions(db: TenantDb) {
  const due = await db.documentVersion.findMany({
    where: { status: "APPROVED", effectiveDate: { lte: new Date() } },
    select: { id: true, organizationId: true },
  });
  for (const v of due) {
    await db.$transaction((tx) =>
      activate(tx, v.id, {
        organizationId: v.organizationId,
        actor: { id: "system", name: "Sistema" },
        ip: null,
        userAgent: null,
      }),
    );
  }
  return due.length;
}

// ───────────────────────────── Lectura obligatoria ─────────────────────────────

/** El lector confirma con su firma (LEÍDO) que leyó y comprendió la versión vigente. */
export async function acknowledgeRead(ctx: ServiceContext, versionId: string, password: string) {
  const read = await ctx.db.readAcknowledgement.findUnique({
    where: { versionId_userId: { versionId, userId: ctx.actor.id } },
  });
  if (!read) throw new ServiceError("not_found");
  if (read.acknowledgedAt) throw new ServiceError("already_acknowledged");
  const version = await loadVersion(ctx.db, versionId);
  if (version.status !== "EFFECTIVE") throw new ServiceError("version_not_effective");
  const signer = await verifySigner(ctx, password, {
    meaning: "READ",
    entityType: ENTITY,
    entityId: versionId,
  });
  return ctx.db.$transaction(async (tx) => {
    const sig = await recordSignature(ctx, tx, signer, {
      meaning: "READ",
      entityType: ENTITY,
      entityId: versionId,
      contentHash: version.fileSha256,
    });
    return tx.readAcknowledgement.update({
      where: { id: read.id },
      data: { acknowledgedAt: sig.signedAt, signatureId: sig.id },
    });
  });
}

// ───────────────────────────── Anulación y obsolescencia ─────────────────────────────

/** Anula un borrador que no seguirá adelante (no se borra: queda CANCELADO con motivo). */
export async function cancelDraft(ctx: ServiceContext, versionId: string, reason: string) {
  if (reason.trim().length < 5) throw new ServiceError("reason_required");
  const version = await loadVersion(ctx.db, versionId);
  if (version.status !== "DRAFT") throw new ServiceError("version_not_editable");
  if (version.authorId !== ctx.actor.id && !(await hasPermission(ctx, "DOC_MANAGE")))
    throw new ServiceError("forbidden");
  return ctx.db.$transaction(async (tx) => {
    const updated = await tx.documentVersion.update({
      where: { id: versionId },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason.trim() },
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "document.version.cancel",
        entityType: ENTITY,
        entityId: versionId,
        before: { status: "DRAFT" },
        after: { status: "CANCELLED" },
        reason,
      },
      tx,
    );
    return updated;
  });
}

/** Declara obsoleto un documento (firma OBSOLETO de un aprobador). Su versión vigente deja de estar en uso. */
export async function obsoleteDocument(
  ctx: ServiceContext,
  documentId: string,
  reason: string,
  password: string,
) {
  await requirePermission(ctx, "DOC_APPROVE");
  if (reason.trim().length < 5) throw new ServiceError("reason_required");
  const doc = await ctx.db.document.findUnique({
    where: { id: documentId },
    include: { versions: true },
  });
  if (!doc) throw new ServiceError("not_found");
  if (doc.status !== "ACTIVE") throw new ServiceError("document_obsolete");
  if (doc.versions.some((v) => ["IN_REVIEW", "PENDING_APPROVAL", "APPROVED"].includes(v.status)))
    throw new ServiceError("version_in_progress");
  const effective = doc.versions.find((v) => v.status === "EFFECTIVE");
  const signer = await verifySigner(ctx, password, {
    meaning: "OBSOLETED",
    entityType: "Document",
    entityId: documentId,
  });
  return ctx.db.$transaction(async (tx) => {
    const now = new Date();
    for (const draft of doc.versions.filter((v) => v.status === "DRAFT")) {
      await tx.documentVersion.update({
        where: { id: draft.id },
        data: { status: "CANCELLED", cancelledAt: now, cancelReason: reason.trim() },
      });
    }
    if (effective)
      await tx.documentVersion.update({
        where: { id: effective.id },
        data: { status: "OBSOLETE", supersededAt: now },
      });
    const updated = await tx.document.update({
      where: { id: documentId },
      data: { status: "OBSOLETE", obsoletedAt: now, obsoleteReason: reason.trim() },
    });
    await recordSignature(ctx, tx, signer, {
      meaning: "OBSOLETED",
      entityType: "Document",
      entityId: documentId,
      contentHash: effective?.fileSha256,
      comment: reason,
    });
    await logAudit(
      {
        ...auditBase(ctx),
        action: "document.obsolete",
        entityType: "Document",
        entityId: documentId,
        before: { status: "ACTIVE" },
        after: { status: "OBSOLETE" },
        reason,
      },
      tx,
    );
    return updated;
  });
}

// ───────────────────────────── Descarga ─────────────────────────────

/**
 * Descarga del archivo de una versión. La vigente la puede ver todo usuario de la empresa; las demás,
 * solo sus participantes y el control documental. Se verifica la integridad (SHA-256) y se audita.
 */
export async function downloadVersionFile(ctx: ServiceContext, versionId: string) {
  const version = await loadVersion(ctx.db, versionId);
  if (!version.storageKey || !version.fileSha256) throw new ServiceError("file_required");
  const participant = [version.authorId, version.reviewerId, version.approverId].includes(
    ctx.actor.id,
  );
  if (version.status !== "EFFECTIVE" && !participant && !(await hasPermission(ctx, "DOC_MANAGE")))
    throw new ServiceError("not_found");
  const data = await readStoredFile(ctx.actor.organizationId, version.storageKey);
  if (sha256(data) !== version.fileSha256) {
    await logAudit({
      ...auditBase(ctx),
      action: "document.file.integrity_error",
      entityType: ENTITY,
      entityId: versionId,
    });
    throw new ServiceError("file_integrity_error");
  }
  await logAudit({
    ...auditBase(ctx),
    action: "document.download",
    entityType: ENTITY,
    entityId: versionId,
    after: { code: version.document.code, version: version.version, status: version.status },
  });
  return {
    data,
    fileName: `${version.document.code}_v${version.version}_${version.fileName}`,
    mime: version.fileMime ?? "application/octet-stream",
    status: version.status,
  };
}

// ───────────────────────────── Bandeja ─────────────────────────────

/** Pendientes del usuario: revisiones, aprobaciones, borradores, lecturas y revisiones periódicas. */
export async function getInbox(ctx: ServiceContext) {
  await promoteDueVersions(ctx.db);
  const me = ctx.actor.id;
  const versionInclude = {
    document: { select: { id: true, code: true, title: true, type: true } },
    author: { select: { fullName: true } },
  } as const;
  const [toReview, toApprove, drafts, reads, dueReview] = await Promise.all([
    ctx.db.documentVersion.findMany({
      where: { reviewerId: me, status: "IN_REVIEW" },
      include: versionInclude,
      orderBy: { submittedAt: "asc" },
    }),
    ctx.db.documentVersion.findMany({
      where: { approverId: me, status: "PENDING_APPROVAL" },
      include: versionInclude,
      orderBy: { reviewedAt: "asc" },
    }),
    ctx.db.documentVersion.findMany({
      where: { authorId: me, status: "DRAFT" },
      include: versionInclude,
      orderBy: { updatedAt: "desc" },
    }),
    ctx.db.readAcknowledgement.findMany({
      where: { userId: me, acknowledgedAt: null, version: { status: "EFFECTIVE" } },
      include: { version: { include: versionInclude } },
      orderBy: { dueDate: "asc" },
    }),
    ctx.db.documentVersion.findMany({
      where: {
        status: "EFFECTIVE",
        nextReviewDate: { lte: addDays(new Date(), 30) },
        document: { ownerId: me, status: "ACTIVE" },
      },
      include: versionInclude,
      orderBy: { nextReviewDate: "asc" },
    }),
  ]);
  return { toReview, toApprove, drafts, reads, dueReview };
}

export function countInbox(db: TenantDb, userId: string) {
  return Promise.all([
    db.documentVersion.count({ where: { reviewerId: userId, status: "IN_REVIEW" } }),
    db.documentVersion.count({ where: { approverId: userId, status: "PENDING_APPROVAL" } }),
    db.readAcknowledgement.count({
      where: { userId, acknowledgedAt: null, version: { status: "EFFECTIVE" } },
    }),
  ]).then((counts) => counts.reduce((a, b) => a + b, 0));
}

export function listMySignatures(db: TenantDb, userId: string) {
  return db.electronicSignature.findMany({
    where: { userId },
    orderBy: { signedAt: "desc" },
    take: 200,
  });
}
