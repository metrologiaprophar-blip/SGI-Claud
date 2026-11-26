import { beforeEach, describe, expect, it } from "vitest";
import { authenticate, MAX_FAILED_ATTEMPTS } from "@/server/auth/authenticate";
import { resetRateLimits } from "@/server/rate-limit";
import { createOrg, createUser, PASSWORD, prisma, requestInfo } from "./helpers";

describe("autenticación (ID corporativo + usuario + contraseña)", () => {
  beforeEach(() => resetRateLimits());

  it("acepta credenciales válidas sin distinguir mayúsculas en empresa/usuario", async () => {
    const org = await createOrg();
    const user = await createUser(org.id, "maria");
    const result = await authenticate(
      { organizationCode: org.code.toLowerCase(), username: " MARIA ", password: PASSWORD },
      requestInfo,
    );
    expect(result?.id).toBe(user.id);
    expect(result?.organizationId).toBe(org.id);
    const log = await prisma.auditLog.findFirst({
      where: { entityId: user.id, action: "auth.login.success" },
    });
    expect(log).not.toBeNull();
  });

  it("rechaza empresa inexistente, usuario de otra empresa y contraseña errónea", async () => {
    const orgA = await createOrg();
    const orgB = await createOrg();
    await createUser(orgA.id, "juan");
    expect(
      await authenticate(
        { organizationCode: "NOEXISTE", username: "juan", password: PASSWORD },
        requestInfo,
      ),
    ).toBeNull();
    expect(
      await authenticate(
        { organizationCode: orgB.code, username: "juan", password: PASSWORD },
        requestInfo,
      ),
    ).toBeNull();
    expect(
      await authenticate(
        { organizationCode: orgA.code, username: "juan", password: "Incorrecta123" },
        requestInfo,
      ),
    ).toBeNull();
  });

  it(`bloquea la cuenta tras ${MAX_FAILED_ATTEMPTS} intentos fallidos, incluso con la clave correcta`, async () => {
    const org = await createOrg();
    const user = await createUser(org.id, "pedro");
    for (let i = 0; i < MAX_FAILED_ATTEMPTS; i++) {
      await authenticate(
        { organizationCode: org.code, username: "pedro", password: "Incorrecta123" },
        requestInfo,
      );
    }
    const locked = await prisma.user.findUnique({ where: { id: user.id } });
    expect(locked?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());
    expect(
      await authenticate(
        { organizationCode: org.code, username: "pedro", password: PASSWORD },
        requestInfo,
      ),
    ).toBeNull();
    expect(
      await prisma.auditLog.count({ where: { entityId: user.id, action: "auth.account.locked" } }),
    ).toBe(1);
  });

  it("rechaza usuarios suspendidos y empresas suspendidas", async () => {
    const org = await createOrg();
    await createUser(org.id, "susp", "USUARIO", { status: "SUSPENDED" });
    expect(
      await authenticate(
        { organizationCode: org.code, username: "susp", password: PASSWORD },
        requestInfo,
      ),
    ).toBeNull();
    const org2 = await createOrg();
    await createUser(org2.id, "ok");
    await prisma.organization.update({ where: { id: org2.id }, data: { status: "SUSPENDED" } });
    expect(
      await authenticate(
        { organizationCode: org2.code, username: "ok", password: PASSWORD },
        requestInfo,
      ),
    ).toBeNull();
  });

  it("marca cambio obligatorio si la clave caducó", async () => {
    const org = await createOrg();
    await createUser(org.id, "vieja", "USUARIO", {
      passwordChangedAt: new Date(Date.now() - 200 * 86_400_000),
    });
    const result = await authenticate(
      { organizationCode: org.code, username: "vieja", password: PASSWORD },
      requestInfo,
    );
    expect(result?.mustChangePassword).toBe(true);
  });
});
