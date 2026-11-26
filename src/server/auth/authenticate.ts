import type { Role } from "@prisma/client";
import { prisma } from "../db/client";
import { logAudit } from "../audit";
import { burnPasswordCheck, verifyPassword } from "./password";
import { normalizeOrgCode, normalizeUsername } from "@/lib/identity";
import type { RequestInfo } from "../request-info";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export type AuthenticatedUser = {
  id: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  username: string;
  fullName: string;
  role: Role;
  locale: string | null;
  mustChangePassword: boolean;
  passwordChangedAt: number;
  sessionIdleMinutes: number;
};

export type AuthenticateInput = { organizationCode: string; username: string; password: string };

/**
 * Verifica credenciales (PRD §3.2 y §7). Devuelve null ante cualquier fallo, sin revelar el motivo.
 * Aplica bloqueo tras MAX_FAILED_ATTEMPTS y registra cada intento en el registro de auditoría.
 */
export async function authenticate(
  input: AuthenticateInput,
  req: RequestInfo,
): Promise<AuthenticatedUser | null> {
  const code = normalizeOrgCode(input.organizationCode);
  const username = normalizeUsername(input.username);
  const now = new Date();
  const base = { ip: req.ip, userAgent: req.userAgent };

  const org = await prisma.organization.findUnique({ where: { code } });
  const user = org
    ? await prisma.user.findUnique({
        where: { organizationId_username: { organizationId: org.id, username } },
      })
    : null;

  if (!org || org.status !== "ACTIVE" || !user || user.status !== "ACTIVE") {
    await burnPasswordCheck(input.password);
    await logAudit({
      ...base,
      organizationId: org?.id ?? null,
      actor: user ? { id: user.id, name: user.fullName } : null,
      action: "auth.login.failure",
      entityType: "User",
      entityId: user?.id,
      after: {
        organizationCode: code,
        username,
        reason: !org
          ? "unknown_org"
          : org.status !== "ACTIVE"
            ? "org_suspended"
            : !user
              ? "unknown_user"
              : "user_suspended",
      },
    });
    return null;
  }

  const actor = { id: user.id, name: user.fullName };

  if (user.lockedUntil && user.lockedUntil > now) {
    await burnPasswordCheck(input.password);
    await logAudit({
      ...base,
      organizationId: org.id,
      actor,
      action: "auth.login.blocked",
      entityType: "User",
      entityId: user.id,
    });
    return null;
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginCount + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: lock
        ? { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) }
        : { failedLoginCount: attempts },
    });
    await logAudit({
      ...base,
      organizationId: org.id,
      actor,
      action: lock ? "auth.account.locked" : "auth.login.failure",
      entityType: "User",
      entityId: user.id,
      after: { reason: "bad_password", attempts },
    });
    return null;
  }

  const expired =
    now.getTime() - user.passwordChangedAt.getTime() > org.passwordMaxAgeDays * 86_400_000;
  const mustChangePassword = user.mustChangePassword || expired;
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now, mustChangePassword },
  });
  await logAudit({
    ...base,
    organizationId: org.id,
    actor,
    action: "auth.login.success",
    entityType: "User",
    entityId: user.id,
    after: expired ? { passwordExpired: true } : undefined,
  });

  return {
    id: user.id,
    organizationId: org.id,
    organizationCode: org.code,
    organizationName: org.name,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    locale: user.locale,
    mustChangePassword,
    passwordChangedAt: user.passwordChangedAt.getTime(),
    sessionIdleMinutes: org.sessionIdleMinutes,
  };
}

/** Datos frescos para refrescar el token tras un cambio (clave, nombre, idioma). */
export async function loadSessionUser(userId: string): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { organization: true },
  });
  if (!user || user.status !== "ACTIVE" || user.organization.status !== "ACTIVE") return null;
  return {
    id: user.id,
    organizationId: user.organizationId,
    organizationCode: user.organization.code,
    organizationName: user.organization.name,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    locale: user.locale,
    mustChangePassword: user.mustChangePassword,
    passwordChangedAt: user.passwordChangedAt.getTime(),
    sessionIdleMinutes: user.organization.sessionIdleMinutes,
  };
}

/** Tras un login correcto: ¿debe el usuario cambiar la clave antes de continuar? */
export async function mustChangePasswordFor(organizationCode: string, username: string) {
  const user = await prisma.user.findFirst({
    where: {
      username: normalizeUsername(username),
      organization: { code: normalizeOrgCode(organizationCode) },
    },
    select: { mustChangePassword: true },
  });
  return user?.mustChangePassword ?? false;
}
