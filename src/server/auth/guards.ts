import { cache } from "react";
import { redirect, notFound } from "next/navigation";
import type { Role } from "@prisma/client";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "../db/client";

export type AppSession = Session & { user: Session["user"] };

/**
 * Lee la sesión y la valida contra la BD (una vez por petición): usuario y empresa activos,
 * y clave sin cambios desde que se emitió la sesión. Sin sesión válida → /login.
 */
const loadSession = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      status: true,
      passwordChangedAt: true,
      mustChangePassword: true,
      organization: { select: { status: true } },
    },
  });
  const valid =
    user &&
    user.status === "ACTIVE" &&
    user.organization.status === "ACTIVE" &&
    user.passwordChangedAt.getTime() === session.user.passwordChangedAt;
  if (!valid) redirect("/salir?motivo=sesion");

  return { session: session as AppSession, mustChangePassword: user.mustChangePassword };
});

/**
 * Sesión válida y SIN cambio de clave pendiente. Es la comprobación por defecto de páginas y acciones.
 * (El proxy no basta: las redirecciones de Server Actions renderizan el destino sin pasar por él.)
 */
export const requireSession = cache(async (): Promise<AppSession> => {
  const { session, mustChangePassword } = await loadSession();
  if (mustChangePassword) redirect("/cambiar-clave");
  return session;
});

/** Solo para /cambiar-clave y el cambio de idioma: admite sesiones con cambio de clave pendiente. */
export const requireSessionAllowingPasswordChange = cache(async (): Promise<AppSession> => {
  return (await loadSession()).session;
});

/** Igual que requireSession, pero exige uno de los roles indicados (si no, 404). */
export async function requireRole(...roles: Role[]): Promise<AppSession> {
  const session = await requireSession();
  if (!roles.includes(session.user.role)) notFound();
  return session;
}

export const isAdmin = (role: Role) => role === "ADMIN_EMPRESA" || role === "SUPER_ADMIN";
