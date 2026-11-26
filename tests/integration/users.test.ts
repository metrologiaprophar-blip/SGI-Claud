import { describe, expect, it } from "vitest";
import {
  createUser as createUserService,
  resetUserPassword,
  updateUser,
} from "@/features/users/service";
import { changeOwnPassword } from "@/features/account/service";
import { updateOrganization } from "@/features/organization/service";
import { verifyPassword } from "@/server/auth/password";
import { createOrg, createUser, ctxFor, PASSWORD, prisma } from "./helpers";

describe("gestión de usuarios y cuenta propia", () => {
  it("crea usuarios con clave temporal y rechaza usuarios duplicados", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    const { user, temporaryPassword } = await createUserService(ctxFor(admin), {
      username: "Nuevo.Usuario",
      fullName: "Nuevo Usuario",
      role: "USUARIO",
    });
    expect(user.username).toBe("nuevo.usuario");
    expect(user.mustChangePassword).toBe(true);
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword(temporaryPassword, stored!.passwordHash)).toBe(true);
    await expect(
      createUserService(ctxFor(admin), {
        username: "nuevo.usuario",
        fullName: "Otro",
        role: "USUARIO",
      }),
    ).rejects.toMatchObject({
      code: "username_taken",
    });
    await expect(
      createUserService(ctxFor(admin), { username: "root", fullName: "Root", role: "SUPER_ADMIN" }),
    ).rejects.toMatchObject({
      code: "role_not_allowed",
    });
  });

  it("registra valor anterior, nuevo y motivo al modificar; nadie cambia su propio rol", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    const user = await createUser(org.id, "operario");
    await updateUser(
      ctxFor(admin),
      user.id,
      { fullName: "Operario Uno", role: "USUARIO", status: "SUSPENDED" },
      "Baja temporal",
    );
    const log = await prisma.auditLog.findFirst({
      where: { entityId: user.id, action: "user.suspend" },
    });
    expect(log?.before).toMatchObject({ status: "ACTIVE", fullName: "Usuario operario" });
    expect(log?.after).toMatchObject({ status: "SUSPENDED", fullName: "Operario Uno" });
    expect(log?.reason).toBe("Baja temporal");
    await expect(
      updateUser(ctxFor(admin), admin.id, {
        fullName: admin.fullName,
        role: "USUARIO",
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({
      code: "cannot_change_own_role_or_status",
    });
  });

  it("el admin restablece la clave de otro usuario pero no la propia", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    const user = await createUser(org.id, "olvidadizo");
    const { temporaryPassword } = await resetUserPassword(ctxFor(admin), user.id);
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await verifyPassword(temporaryPassword, stored!.passwordHash)).toBe(true);
    await expect(resetUserPassword(ctxFor(admin), admin.id)).rejects.toMatchObject({
      code: "cannot_reset_own_password",
    });
  });

  it("el cambio de clave aplica política e historial", async () => {
    const org = await createOrg();
    const user = await createUser(org.id, "rosa", "USUARIO", { mustChangePassword: true });
    const ctx = ctxFor(user);
    await expect(changeOwnPassword(ctx, "mala", "OtraClave2026")).rejects.toMatchObject({
      code: "current_password_invalid",
    });
    await expect(changeOwnPassword(ctx, PASSWORD, "corta1")).rejects.toMatchObject({
      code: "password_too_short",
    });
    await expect(changeOwnPassword(ctx, PASSWORD, "rosaClave2026")).rejects.toMatchObject({
      code: "password_contains_username",
    });
    await expect(changeOwnPassword(ctx, PASSWORD, PASSWORD)).rejects.toMatchObject({
      code: "password_reused",
    });
    await changeOwnPassword(ctx, PASSWORD, "NuevaClave2026");
    await expect(changeOwnPassword(ctx, "NuevaClave2026", PASSWORD)).rejects.toMatchObject({
      code: "password_reused",
    });
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.mustChangePassword).toBe(false);
  });

  it("los cambios en la empresa quedan auditados y solo afectan a la propia", async () => {
    const org = await createOrg();
    const admin = await createUser(org.id, "admin", "ADMIN_EMPRESA");
    await updateOrganization(
      ctxFor(admin),
      {
        name: "PROPHAR Test",
        timezone: "America/Guayaquil",
        passwordMaxAgeDays: 60,
        sessionIdleMinutes: 10,
      },
      "Política QA-01",
    );
    const log = await prisma.auditLog.findFirst({
      where: { entityId: org.id, action: "organization.update" },
    });
    expect(log?.after).toMatchObject({ passwordMaxAgeDays: 60, sessionIdleMinutes: 10 });
    expect(log?.reason).toBe("Política QA-01");
  });
});
