import { beforeEach, describe, expect, it } from "vitest";
import { requestPasswordReset } from "@/server/public/password-reset";
import {
  approveResetRequest,
  listResetRequests,
  rejectResetRequest,
} from "@/features/reset-requests/service";
import { verifyPassword } from "@/server/auth/password";
import { resetRateLimits } from "@/server/rate-limit";
import { ServiceError } from "@/lib/errors";
import { createOrg, createUser, ctxFor, prisma, requestInfo } from "./helpers";

describe("restablecimiento de clave por aprobación del administrador", () => {
  beforeEach(() => resetRateLimits());

  it("registra la solicitud solo si existe la cuenta y sin duplicados", async () => {
    const org = await createOrg();
    const user = await createUser(org.id, "olvido");
    expect(
      await requestPasswordReset(
        { organizationCode: org.code, username: "olvido", note: "ext 214" },
        requestInfo,
      ),
    ).toBe(true);
    expect(
      await requestPasswordReset({ organizationCode: org.code, username: "olvido" }, requestInfo),
    ).toBe(false);
    expect(
      await requestPasswordReset({ organizationCode: org.code, username: "noexiste" }, requestInfo),
    ).toBe(false);
    expect(
      await prisma.passwordResetRequest.count({ where: { userId: user.id, status: "PENDING" } }),
    ).toBe(1);
  });

  it("el admin aprueba: clave temporal válida, cambio obligatorio y auditoría", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    const user = await createUser(org.id, "tecnico", "USUARIO", {
      failedLoginCount: 3,
      lockedUntil: new Date(Date.now() + 600_000),
    });
    await requestPasswordReset({ organizationCode: org.code, username: "tecnico" }, requestInfo);
    const [request] = await listResetRequests(ctxFor(admin).db, "PENDING");

    const result = await approveResetRequest(ctxFor(admin), request!.id);
    const updated = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword(result.temporaryPassword, updated!.passwordHash)).toBe(true);
    expect(updated?.mustChangePassword).toBe(true);
    expect(updated?.lockedUntil).toBeNull();
    expect(updated?.passwordHistory).toEqual([user.passwordHash]);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: request!.id, action: "password_reset.approved" },
    });
    expect(log?.actorId).toBe(admin.id);
    await expect(approveResetRequest(ctxFor(admin), request!.id)).rejects.toMatchObject({
      code: "request_not_pending",
    });
  });

  it("nadie resuelve su propia solicitud y el rechazo exige motivo", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    const admin2 = await createUser(org.id, "admin2", "ADMIN_EMPRESA");
    await requestPasswordReset({ organizationCode: org.code, username: "admin" }, requestInfo);
    const [request] = await listResetRequests(ctxFor(admin).db, "PENDING");
    await expect(approveResetRequest(ctxFor(admin), request!.id)).rejects.toMatchObject({
      code: "cannot_resolve_own_request",
    });
    await expect(rejectResetRequest(ctxFor(admin2), request!.id, "  ")).rejects.toBeInstanceOf(
      ServiceError,
    );
    await rejectResetRequest(ctxFor(admin2), request!.id, "No verificado por teléfono");
    expect(
      (await prisma.passwordResetRequest.findUnique({ where: { id: request!.id } }))?.status,
    ).toBe("REJECTED");
  });

  it("un admin de otra empresa no ve ni resuelve la solicitud", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    await createUser(orgA.id, "usuario");
    const adminB = await createUser(orgB.id, "admin", "ADMIN_EMPRESA");
    await requestPasswordReset({ organizationCode: orgA.code, username: "usuario" }, requestInfo);
    const req = await prisma.passwordResetRequest.findFirst({ where: { organizationId: orgA.id } });
    expect(await listResetRequests(ctxFor(adminB).db)).toHaveLength(0);
    await expect(approveResetRequest(ctxFor(adminB), req!.id)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("las solicitudes vencidas pasan a caducadas", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    const user = await createUser(org.id, "tarde");
    await prisma.passwordResetRequest.create({
      data: { organizationId: org.id, userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });
    const rows = await listResetRequests(ctxFor(admin).db);
    expect(rows[0]?.status).toBe("EXPIRED");
  });
});
