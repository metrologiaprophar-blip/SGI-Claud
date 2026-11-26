import NextAuth, { type User } from "next-auth";
import type { JWT } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { authenticate, loadSessionUser, type AuthenticatedUser } from "@/server/auth/authenticate";
import { requestInfoFrom } from "@/server/request-info";
import { rateLimit } from "@/server/rate-limit";

const credentialsSchema = z.object({
  organizationCode: z.string().trim().min(1).max(32),
  username: z.string().trim().min(1).max(48),
  password: z.string().min(1).max(128),
});

const SESSION_MAX_AGE = 8 * 60 * 60; // 8 h de duración absoluta

function applyUser(token: JWT, u: AuthenticatedUser | User): JWT {
  return {
    ...token,
    uid: u.id,
    organizationId: u.organizationId,
    organizationCode: u.organizationCode,
    organizationName: u.organizationName,
    username: u.username,
    fullName: u.fullName,
    name: u.fullName,
    role: u.role,
    locale: u.locale,
    mustChangePassword: u.mustChangePassword,
    passwordChangedAt: u.passwordChangedAt,
    sessionIdleMinutes: u.sessionIdleMinutes,
    lastActivity: Date.now(),
  };
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  pages: { signIn: "/login", error: "/login" },
  logger: {
    // Las credenciales incorrectas son un evento esperado y ya quedan en el registro de auditoría.
    error(error) {
      if (
        error.name === "CredentialsSignin" ||
        (error as { type?: string }).type === "CredentialsSignin"
      )
        return;
      console.error("[auth]", error);
    },
  },
  providers: [
    Credentials({
      credentials: { organizationCode: {}, username: {}, password: {} },
      async authorize(raw, request) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const info = requestInfoFrom(request.headers);
        if (!rateLimit(`login:${info.ip ?? "unknown"}`, 20, 15 * 60_000)) return null;
        const user = await authenticate(parsed.data, info);
        return user as unknown as User | null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) return applyUser(token, user);
      if (!token.uid) return null;

      // Cierre de sesión por inactividad (configurable por empresa).
      const idleMs = (token.sessionIdleMinutes ?? 15) * 60_000;
      if (token.lastActivity && Date.now() - token.lastActivity > idleMs) return null;

      // Tras un cambio (p. ej. de clave) se recargan los datos desde la BD; nunca del cliente.
      if (trigger === "update") {
        const fresh = await loadSessionUser(token.uid);
        return fresh ? applyUser(token, fresh) : null;
      }
      return { ...token, lastActivity: Date.now() };
    },
    session({ session, token }) {
      session.user = {
        ...session.user,
        id: token.uid ?? "",
        organizationId: token.organizationId ?? "",
        organizationCode: token.organizationCode ?? "",
        organizationName: token.organizationName ?? "",
        username: token.username ?? "",
        fullName: token.fullName ?? "",
        name: token.fullName ?? "",
        role: token.role ?? "USUARIO",
        locale: token.locale ?? null,
        mustChangePassword: token.mustChangePassword ?? false,
        passwordChangedAt: token.passwordChangedAt ?? 0,
      };
      return session;
    },
  },
});
