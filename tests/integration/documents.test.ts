import { beforeAll, describe, expect, it } from "vitest";
import {
  acknowledgeRead,
  approveVersion,
  cancelDraft,
  createDocument,
  createNewVersion,
  downloadVersionFile,
  getDocument,
  getInbox,
  listDocuments,
  obsoleteDocument,
  reviewVersion,
  submitForReview,
  uploadDraftFile,
} from "@/features/documents/service";
import { todayInZone } from "@/lib/dates";
import { verifySignatureHash } from "@/server/signatures";
import { createTenantClient } from "@/server/db/tenant-client";
import { createOrg, createUser, ctxFor, PASSWORD, prisma } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const PDF_V2 = Buffer.from("%PDF-1.4\n% version 2\ntrailer<<>>\n%%EOF\n");
const today = () => todayInZone("America/Guayaquil");

type U = Awaited<ReturnType<typeof createUser>>;

async function setup() {
  const org = await createOrg("DOC");
  const process = await prisma.process.create({
    data: { organizationId: org.id, code: "MET", name: "Metrología" },
  });
  const author = await createUser(org.id, "autor", "USUARIO", { permissions: ["DOC_MANAGE"] });
  const reviewer = await createUser(org.id, "revisor");
  const approver = await createUser(org.id, "aprobador", "ADMIN_EMPRESA", {
    permissions: ["DOC_MANAGE", "DOC_APPROVE"],
  });
  const reader = await createUser(org.id, "lector");
  return { org, process, author, reviewer, approver, reader };
}

async function draftWithFile(s: Awaited<ReturnType<typeof setup>>, code = "POE-MET-001") {
  const { document, version } = await createDocument(ctxFor(s.author), {
    code,
    title: "Calibración de balanzas analíticas",
    type: "SOP",
    processId: s.process.id,
    standards: ["GMP", "ISO17025"],
    reviewPeriodMonths: 24,
    changeSummary: "Emisión inicial",
  });
  await uploadDraftFile(ctxFor(s.author), version.id, "poe-balanzas.pdf", PDF);
  return { document, version };
}

async function approveFlow(
  s: Awaited<ReturnType<typeof setup>>,
  versionId: string,
  readers: U[] = [],
) {
  await submitForReview(ctxFor(s.author), versionId, {
    reviewerId: s.reviewer.id,
    approverId: s.approver.id,
    readerIds: readers.map((r) => r.id),
    effectiveDate: today(),
    changeSummary: "Emisión inicial",
    password: PASSWORD,
  });
  await reviewVersion(ctxFor(s.reviewer), versionId, { decision: "approve", password: PASSWORD });
  return approveVersion(ctxFor(s.approver), versionId, { decision: "approve", password: PASSWORD });
}

describe("control documental GMP", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    s = await setup();
  });

  it("ciclo completo: elaboró → revisó → aprobó → vigente, con firmas íntegras y lectura obligatoria", async () => {
    const { document, version } = await draftWithFile(s);
    const effective = await approveFlow(s, version.id, [s.reader]);
    expect(effective.status).toBe("EFFECTIVE");
    expect(effective.nextReviewDate?.getUTCFullYear()).toBe(
      effective.effectiveDate!.getUTCFullYear() + 2,
    );

    const doc = await getDocument(ctxFor(s.author).db, document.id);
    expect(doc?.signatures.map((x) => x.meaning)).toEqual(["AUTHORED", "REVIEWED", "APPROVED"]);
    for (const sig of doc!.signatures) {
      expect(sig.contentHash).toBe(version.fileSha256 ?? doc!.versions[0]!.fileSha256);
      expect(verifySignatureHash(sig)).toBe(true);
    }
    expect(verifySignatureHash({ ...doc!.signatures[0]!, userFullName: "Otra persona" })).toBe(
      false,
    );

    const inbox = await getInbox(ctxFor(s.reader));
    expect(inbox.reads).toHaveLength(1);
    await expect(acknowledgeRead(ctxFor(s.reader), version.id, "mala")).rejects.toMatchObject({
      code: "signature_password_invalid",
    });
    await acknowledgeRead(ctxFor(s.reader), version.id, PASSWORD);
    expect((await getInbox(ctxFor(s.reader))).reads).toHaveLength(0);
    await expect(acknowledgeRead(ctxFor(s.reader), version.id, PASSWORD)).rejects.toMatchObject({
      code: "already_acknowledged",
    });
  });

  it("segregación de funciones y permisos", async () => {
    const { version } = await draftWithFile(s, "POE-MET-002");
    const base = { readerIds: [], effectiveDate: today(), changeSummary: "x", password: PASSWORD };
    await expect(
      submitForReview(ctxFor(s.author), version.id, {
        ...base,
        reviewerId: s.author.id,
        approverId: s.approver.id,
      }),
    ).rejects.toMatchObject({
      code: "segregation_of_duties",
    });
    await expect(
      submitForReview(ctxFor(s.author), version.id, {
        ...base,
        reviewerId: s.approver.id,
        approverId: s.approver.id,
      }),
    ).rejects.toMatchObject({
      code: "segregation_of_duties",
    });
    await expect(
      submitForReview(ctxFor(s.author), version.id, {
        ...base,
        reviewerId: s.approver.id,
        approverId: s.reviewer.id,
      }),
    ).rejects.toMatchObject({
      code: "approver_without_permission",
    });
    await expect(
      submitForReview(ctxFor(s.reviewer), version.id, {
        ...base,
        reviewerId: s.reader.id,
        approverId: s.approver.id,
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    await expect(
      submitForReview(ctxFor(s.author), version.id, {
        ...base,
        reviewerId: s.reviewer.id,
        approverId: s.approver.id,
        password: "mala",
      }),
    ).rejects.toMatchObject({
      code: "signature_password_invalid",
    });
    await expect(
      createDocument(ctxFor(s.reviewer), {
        code: "X-1",
        title: "x",
        type: "SOP",
        processId: s.process.id,
        standards: [],
        reviewPeriodMonths: 12,
        changeSummary: "",
      }),
    ).rejects.toMatchObject({ code: "forbidden" });

    await submitForReview(ctxFor(s.author), version.id, {
      ...base,
      reviewerId: s.reviewer.id,
      approverId: s.approver.id,
    });
    // Solo el revisor asignado revisa, y no se puede aprobar antes de revisar.
    await expect(
      reviewVersion(ctxFor(s.approver), version.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      approveVersion(ctxFor(s.approver), version.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({
      code: "version_not_pending_approval",
    });
    // El contenido no puede cambiar una vez enviado.
    await expect(
      uploadDraftFile(ctxFor(s.author), version.id, "otro.pdf", PDF_V2),
    ).rejects.toMatchObject({ code: "version_not_editable" });
  });

  it("el rechazo devuelve a borrador con el comentario y exige motivo", async () => {
    const { version } = await draftWithFile(s, "POE-MET-003");
    await submitForReview(ctxFor(s.author), version.id, {
      reviewerId: s.reviewer.id,
      approverId: s.approver.id,
      readerIds: [],
      effectiveDate: today(),
      changeSummary: "x",
      password: PASSWORD,
    });
    await expect(
      reviewVersion(ctxFor(s.reviewer), version.id, {
        decision: "reject",
        comment: "",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({
      code: "reason_required",
    });
    const rejected = await reviewVersion(ctxFor(s.reviewer), version.id, {
      decision: "reject",
      comment: "Falta el criterio de aceptación",
      password: PASSWORD,
    });
    expect(rejected.status).toBe("DRAFT");
    expect(rejected.lastRejection).toBe("Falta el criterio de aceptación");
    await uploadDraftFile(ctxFor(s.author), version.id, "corregido.pdf", PDF_V2);
  });

  it("una nueva versión sustituye a la vigente; solo una versión abierta a la vez", async () => {
    const { document, version } = await draftWithFile(s, "POE-MET-004");
    await approveFlow(s, version.id);
    await expect(
      createNewVersion(ctxFor(s.reviewer), document.id, "Actualización de tolerancias"),
    ).rejects.toMatchObject({ code: "forbidden" });
    const v2 = await createNewVersion(
      ctxFor(s.author),
      document.id,
      "Actualización de tolerancias",
    );
    expect(v2.version).toBe(2);
    await expect(createNewVersion(ctxFor(s.author), document.id, "Otra más")).rejects.toMatchObject(
      { code: "version_in_progress" },
    );
    await uploadDraftFile(ctxFor(s.author), v2.id, "v2.pdf", PDF_V2);
    await approveFlow(s, v2.id);
    const doc = await getDocument(ctxFor(s.author).db, document.id);
    expect(doc?.versions.map((v) => `${v.version}:${v.status}`)).toEqual([
      "2:EFFECTIVE",
      "1:SUPERSEDED",
    ]);
    const list = await listDocuments(ctxFor(s.reader).db, { q: "POE-MET-004" });
    expect(list[0]?.current?.version).toBe(2);
  });

  it("vigencia futura: queda APROBADA hasta su fecha", async () => {
    const { version } = await draftWithFile(s, "POE-MET-005");
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    await submitForReview(ctxFor(s.author), version.id, {
      reviewerId: s.reviewer.id,
      approverId: s.approver.id,
      readerIds: [],
      effectiveDate: tomorrow,
      changeSummary: "x",
      password: PASSWORD,
    });
    await reviewVersion(ctxFor(s.reviewer), version.id, {
      decision: "approve",
      password: PASSWORD,
    });
    const approved = await approveVersion(ctxFor(s.approver), version.id, {
      decision: "approve",
      password: PASSWORD,
    });
    expect(approved.status).toBe("APPROVED");
    await expect(
      submitForReview(ctxFor(s.author), (await draftWithFile(s, "POE-MET-006")).version.id, {
        reviewerId: s.reviewer.id,
        approverId: s.approver.id,
        readerIds: [],
        effectiveDate: "2020-01-01",
        changeSummary: "x",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_effective_date" });
  });

  it("descargas: vigente para todos, borrador solo participantes; integridad verificada", async () => {
    const { version } = await draftWithFile(s, "POE-MET-007");
    await expect(downloadVersionFile(ctxFor(s.reader), version.id)).rejects.toMatchObject({
      code: "not_found",
    });
    const own = await downloadVersionFile(ctxFor(s.author), version.id);
    expect(own.data.equals(PDF)).toBe(true);
    await approveFlow(s, version.id);
    expect((await downloadVersionFile(ctxFor(s.reader), version.id)).fileName).toMatch(
      /^POE-MET-007_v1_/,
    );
    expect(
      await prisma.auditLog.count({ where: { entityId: version.id, action: "document.download" } }),
    ).toBe(2);
  });

  it("archivos: se rechazan formatos falsos y vacíos", async () => {
    const { version } = await createDocument(ctxFor(s.author), {
      code: "FOR-MET-001",
      title: "Registro de verificación",
      type: "FORM",
      processId: s.process.id,
      standards: [],
      reviewPeriodMonths: 12,
      changeSummary: "",
    });
    await expect(
      uploadDraftFile(ctxFor(s.author), version.id, "falso.pdf", Buffer.from("MZ ejecutable")),
    ).rejects.toMatchObject({
      code: "file_type_not_allowed",
    });
    await expect(
      uploadDraftFile(ctxFor(s.author), version.id, "script.exe", PDF),
    ).rejects.toMatchObject({ code: "file_type_not_allowed" });
    await expect(
      uploadDraftFile(ctxFor(s.author), version.id, "vacio.pdf", Buffer.alloc(0)),
    ).rejects.toMatchObject({ code: "file_required" });
    await expect(
      submitForReview(ctxFor(s.author), version.id, {
        reviewerId: s.reviewer.id,
        approverId: s.approver.id,
        readerIds: [],
        effectiveDate: today(),
        changeSummary: "",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "file_required" });
    await cancelDraft(ctxFor(s.author), version.id, "Formato duplicado");
    expect((await prisma.documentVersion.findUnique({ where: { id: version.id } }))?.status).toBe(
      "CANCELLED",
    );
  });

  it("obsolescencia con firma de un aprobador", async () => {
    const { document, version } = await draftWithFile(s, "POE-MET-008");
    await approveFlow(s, version.id);
    await expect(
      obsoleteDocument(ctxFor(s.author), document.id, "Proceso eliminado", PASSWORD),
    ).rejects.toMatchObject({ code: "forbidden" });
    await obsoleteDocument(ctxFor(s.approver), document.id, "Proceso eliminado", PASSWORD);
    const doc = await getDocument(ctxFor(s.approver).db, document.id);
    expect(doc?.status).toBe("OBSOLETE");
    expect(doc?.versions[0]?.status).toBe("OBSOLETE");
    expect((await listDocuments(ctxFor(s.reader).db, { q: "POE-MET-008" })).length).toBe(0);
    await expect(
      createNewVersion(ctxFor(s.author), document.id, "Reactivar"),
    ).rejects.toMatchObject({ code: "document_obsolete" });
  });

  it("código único por empresa y aislamiento total entre empresas", async () => {
    await expect(draftWithFile(s, "POE-MET-001")).rejects.toMatchObject({
      code: "document_code_taken",
    });
    const other = await setup();
    const { document, version } = await draftWithFile(other, "POE-MET-001"); // mismo código, otra empresa: permitido
    expect(await getDocument(ctxFor(s.author).db, document.id)).toBeNull();
    await expect(downloadVersionFile(ctxFor(s.approver), version.id)).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      reviewVersion(ctxFor(s.reviewer), version.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "not_found" });
    // Un revisor de otra empresa no se puede asignar.
    await expect(
      submitForReview(ctxFor(other.author), version.id, {
        reviewerId: s.reviewer.id,
        approverId: other.approver.id,
        readerIds: [],
        effectiveDate: today(),
        changeSummary: "",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "invalid_user" });
    // Un proceso de otra empresa tampoco.
    await expect(
      createDocument(ctxFor(s.author), {
        code: "X-2",
        title: "x",
        type: "SOP",
        processId: other.process.id,
        standards: [],
        reviewPeriodMonths: 12,
        changeSummary: "",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("las firmas electrónicas son de solo inserción", async () => {
    const sig = await prisma.electronicSignature.findFirst();
    await expect(
      prisma.electronicSignature.update({ where: { id: sig!.id }, data: { comment: "x" } }),
    ).rejects.toThrow(/solo inserción/);
    await expect(
      createTenantClient(prisma, s.org.id).electronicSignature.deleteMany({}),
    ).rejects.toThrow(/solo inserción/);
  });
});
