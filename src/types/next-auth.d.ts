import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
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
  }
  interface Session {
    user: {
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
    } & Omit<DefaultSession["user"], "id">;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    organizationId?: string;
    organizationCode?: string;
    organizationName?: string;
    username?: string;
    fullName?: string;
    role?: Role;
    locale?: string | null;
    mustChangePassword?: boolean;
    passwordChangedAt?: number;
    sessionIdleMinutes?: number;
    lastActivity?: number;
  }
}
