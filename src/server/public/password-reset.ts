import { prisma } from "../db/client";
import { logAudit } from "../audit";
import { rateLimit } from "../rate-limit";
import type { RequestInfo } from "../request-info";
import { normalizeOrgCode, normalizeUsername } from "@/lib/identity";

export const RESET_REQUEST_TTL_HOURS = 72;

/**
 * Registra una solicitud de restablecimiento (PRD §3.5). Nunca revela si la empresa o el usuario
 * existen: el llamador muestra siempre el mismo mensaje. Devuelve true si se creó una solicitud.
 */
export async function requestPasswordReset(
  input: { organizationCode: string; username: string; note?: string | null },
  req: RequestInfo,
): Promise<boolean> {
  if (!rateLimit(`reset:${req.ip ?? "unknown"}`, 5, 60 * 60_000)) return false;

  const org = await prisma.organization.findUnique({
    where: { code: normalizeOrgCode(input.organizationCode) },
  });
  if (!org || org.status !== "ACTIVE") return false;
  const user = await prisma.user.findUnique({
    where: {
      organizationId_username: {
        organizationId: org.id,
        username: normalizeUsername(input.username),
      },
    },
  });
  if (!user || user.status !== "ACTIVE") return false;

  const now = new Date();
  await prisma.passwordResetRequest.updateMany({
    where: { userId: user.id, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "EXPIRED" },
  });
  const pending = await prisma.passwordResetRequest.findFirst({
    where: { userId: user.id, status: "PENDING" },
  });
  if (pending) return false;

  const request = await prisma.passwordResetRequest.create({
    data: {
      organizationId: org.id,
      userId: user.id,
      note: input.note?.trim().slice(0, 500) || null,
      requestIp: req.ip,
      expiresAt: new Date(now.getTime() + RESET_REQUEST_TTL_HOURS * 3_600_000),
    },
  });
  await logAudit({
    organizationId: org.id,
    actor: { id: user.id, name: user.fullName },
    action: "password_reset.requested",
    entityType: "PasswordResetRequest",
    entityId: request.id,
    ip: req.ip,
    userAgent: req.userAgent,
  });
  return true;
}
