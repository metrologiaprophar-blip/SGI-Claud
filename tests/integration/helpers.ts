import { randomUUID } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { createTenantClient } from "@/server/db/tenant-client";
import { hashPassword } from "@/server/auth/password";
import type { ServiceContext } from "@/server/context";

export const PASSWORD = "Prueba2026Segura";
const req = { ip: "127.0.0.1", userAgent: "vitest" };

export async function createOrg(prefix = "ORG") {
  const code = `${prefix}${randomUUID().slice(0, 6).toUpperCase()}`;
  return prisma.organization.create({ data: { code, name: `Empresa ${code}` } });
}

export async function createUser(
  organizationId: string,
  username: string,
  role: Role = "USUARIO",
  extra: Record<string, unknown> = {},
) {
  return prisma.user.create({
    data: {
      organizationId,
      username,
      fullName: `Usuario ${username}`,
      role,
      passwordHash: await hashPassword(PASSWORD),
      ...extra,
    },
  });
}

export function ctxFor(user: {
  id: string;
  fullName: string;
  role: Role;
  organizationId: string;
}): ServiceContext {
  return {
    db: createTenantClient(prisma, user.organizationId),
    actor: {
      id: user.id,
      name: user.fullName,
      role: user.role,
      organizationId: user.organizationId,
    },
    req,
  };
}

export const requestInfo = req;
export { prisma };
