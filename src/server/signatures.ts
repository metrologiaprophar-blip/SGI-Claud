import type { SignatureMeaning } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { logAudit } from "./audit";
import { verifyPassword } from "./auth/password";
import { auditBase, type ServiceContext } from "./context";
import { sha256 } from "./storage";
import type { TenantDb } from "./db/tenant-client";

type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];

export type SignatureRequest = {
  meaning: SignatureMeaning;
  entityType: string;
  entityId: string;
  contentHash?: string | null;
  comment?: string | null;
};

/**
 * Paso 1 de una firma electrónica: reautenticación con la contraseña del firmante (fuera de la
 * transacción, porque bcrypt es lento). Un fallo queda registrado en la auditoría.
 */
export async function verifySigner(
  ctx: ServiceContext,
  password: string,
  request: SignatureRequest,
) {
  const user = await ctx.db.user.findUnique({ where: { id: ctx.actor.id } });
  if (!user || user.status !== "ACTIVE") throw new ServiceError("forbidden");
  if (!password || !(await verifyPassword(password, user.passwordHash))) {
    await logAudit({
      ...auditBase(ctx),
      action: "signature.failed",
      entityType: request.entityType,
      entityId: request.entityId,
      after: { meaning: request.meaning },
    });
    throw new ServiceError("signature_password_invalid");
  }
  return { fullName: user.fullName, jobTitle: user.jobTitle };
}

/** Manifiesto que se firma: quién, qué significado, cuándo, sobre qué registro y qué contenido. */
export function signatureManifest(input: {
  organizationId: string;
  userId: string;
  userFullName: string;
  meaning: SignatureMeaning;
  entityType: string;
  entityId: string;
  contentHash?: string | null;
  signedAt: Date;
}) {
  return JSON.stringify({
    o: input.organizationId,
    u: input.userId,
    n: input.userFullName,
    m: input.meaning,
    t: input.entityType,
    e: input.entityId,
    c: input.contentHash ?? null,
    s: input.signedAt.toISOString(),
  });
}

/** Paso 2: registra la firma (solo inserción) dentro de la transacción del cambio que firma. */
export async function recordSignature(
  ctx: ServiceContext,
  tx: Tx,
  signer: { fullName: string; jobTitle: string | null },
  request: SignatureRequest,
) {
  const signedAt = new Date();
  const signatureHash = sha256(
    signatureManifest({
      organizationId: ctx.actor.organizationId,
      userId: ctx.actor.id,
      userFullName: signer.fullName,
      meaning: request.meaning,
      entityType: request.entityType,
      entityId: request.entityId,
      contentHash: request.contentHash,
      signedAt,
    }),
  );
  const signature = await tx.electronicSignature.create({
    data: {
      organizationId: ctx.actor.organizationId,
      userId: ctx.actor.id,
      userFullName: signer.fullName,
      userJobTitle: signer.jobTitle,
      meaning: request.meaning,
      entityType: request.entityType,
      entityId: request.entityId,
      contentHash: request.contentHash ?? null,
      signatureHash,
      comment: request.comment?.trim() || null,
      ip: ctx.req.ip,
      signedAt,
    },
  });
  await logAudit(
    {
      ...auditBase(ctx),
      action: `signature.${request.meaning.toLowerCase()}`,
      entityType: request.entityType,
      entityId: request.entityId,
      after: {
        signatureId: signature.id,
        meaning: request.meaning,
        contentHash: request.contentHash ?? null,
      },
      reason: request.comment ?? undefined,
    },
    tx,
  );
  return signature;
}

/** Comprueba que una firma guardada corresponde a su manifiesto (no fue alterada). */
export function verifySignatureHash(sig: {
  organizationId: string;
  userId: string;
  userFullName: string;
  meaning: SignatureMeaning;
  entityType: string;
  entityId: string;
  contentHash: string | null;
  signedAt: Date;
  signatureHash: string;
}) {
  return sha256(signatureManifest(sig)) === sig.signatureHash;
}
