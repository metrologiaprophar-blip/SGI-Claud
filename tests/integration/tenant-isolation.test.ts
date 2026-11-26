import { describe, expect, it, beforeAll } from "vitest";
import { createTenantClient, TenantViolationError } from "@/server/db/tenant-client";
import { logAudit } from "@/server/audit";
import { createOrg, createUser, prisma } from "./helpers";

describe("aislamiento por empresa (getTenantDb)", () => {
  let orgA: { id: string }, orgB: { id: string };
  let userA: { id: string }, userB: { id: string };

  beforeAll(async () => {
    orgA = await createOrg("A");
    orgB = await createOrg("B");
    userA = await createUser(orgA.id, "ana");
    userB = await createUser(orgB.id, "beto");
    await prisma.passwordResetRequest.create({
      data: {
        organizationId: orgB.id,
        userId: userB.id,
        expiresAt: new Date(Date.now() + 3600_000),
      },
    });
    await logAudit({ organizationId: orgB.id, action: "test.b" });
  });

  it("solo lista usuarios de su empresa", async () => {
    const dbA = createTenantClient(prisma, orgA.id);
    const users = await dbA.user.findMany();
    expect(users.map((u) => u.id)).toEqual([userA.id]);
  });

  it("no lee un usuario de otra empresa aunque conozca su id", async () => {
    const dbA = createTenantClient(prisma, orgA.id);
    expect(await dbA.user.findUnique({ where: { id: userB.id } })).toBeNull();
    expect(await dbA.user.findFirst({ where: { username: "beto" } })).toBeNull();
    expect(await dbA.user.count({ where: { id: userB.id } })).toBe(0);
  });

  it("no modifica ni borra registros de otra empresa", async () => {
    const dbA = createTenantClient(prisma, orgA.id);
    await expect(
      dbA.user.update({ where: { id: userB.id }, data: { fullName: "hack" } }),
    ).rejects.toThrow();
    expect(
      (await dbA.user.updateMany({ where: { id: userB.id }, data: { fullName: "hack" } })).count,
    ).toBe(0);
    expect((await dbA.user.deleteMany({ where: { id: userB.id } })).count).toBe(0);
    const b = await prisma.user.findUnique({ where: { id: userB.id } });
    expect(b?.fullName).toBe("Usuario beto");
  });

  it("rechaza altas en otra empresa o cambios de empresa", async () => {
    const dbA = createTenantClient(prisma, orgA.id);
    await expect(
      dbA.user.create({
        data: { organizationId: orgB.id, username: "x", fullName: "x", passwordHash: "x" },
      }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    await expect(
      dbA.user.update({ where: { id: userA.id }, data: { organizationId: orgB.id } }),
    ).rejects.toBeInstanceOf(TenantViolationError);
    await expect(dbA.user.findMany({ where: { organizationId: orgB.id } })).rejects.toBeInstanceOf(
      TenantViolationError,
    );
  });

  it("asigna su empresa automáticamente en las altas", async () => {
    const dbA = createTenantClient(prisma, orgA.id);
    const created = await dbA.user.create({
      data: { username: "auto", fullName: "Auto", passwordHash: "x" } as never,
    });
    expect(created.organizationId).toBe(orgA.id);
  });

  it("no ve la empresa, solicitudes ni auditoría de otra empresa", async () => {
    const dbA = createTenantClient(prisma, orgA.id);
    await expect(dbA.organization.findUnique({ where: { id: orgB.id } })).rejects.toBeInstanceOf(
      TenantViolationError,
    );
    expect(await dbA.organization.findUnique({ where: { id: orgA.id } })).not.toBeNull();
    expect(await dbA.passwordResetRequest.count()).toBe(0);
    expect(await dbA.auditLog.count({ where: { action: "test.b" } })).toBe(0);
  });

  it("el registro de auditoría es de solo inserción", async () => {
    const dbB = createTenantClient(prisma, orgB.id);
    await expect(dbB.auditLog.deleteMany({})).rejects.toThrow(/solo inserción/);
    const log = await prisma.auditLog.findFirst({ where: { action: "test.b" } });
    await expect(
      prisma.auditLog.update({ where: { id: log!.id }, data: { action: "x" } }),
    ).rejects.toThrow(/solo inserción/);
    await expect(prisma.auditLog.deleteMany({})).rejects.toThrow(/solo inserción/);
  });
});
