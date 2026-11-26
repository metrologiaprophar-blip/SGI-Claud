import { ServiceError } from "@/lib/errors";
import { auditBase, type ServiceContext } from "@/server/context";
import { logAudit } from "@/server/audit";
import {
  checkPasswordPolicy,
  hashPassword,
  isPasswordReused,
  nextHistory,
  verifyPassword,
} from "@/server/auth/password";

/** Cambio de la clave propia con política, historial y registro de auditoría. */
export async function changeOwnPassword(
  ctx: ServiceContext,
  currentPassword: string,
  newPassword: string,
) {
  const user = await ctx.db.user.findUnique({ where: { id: ctx.actor.id } });
  if (!user) throw new ServiceError("not_found");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    await logAudit({
      ...auditBase(ctx),
      action: "user.password.change_failed",
      entityType: "User",
      entityId: user.id,
    });
    throw new ServiceError("current_password_invalid");
  }
  const policy = checkPasswordPolicy(newPassword, user.username);
  if (policy) throw new ServiceError(`password_${policy}`);
  if (await isPasswordReused(newPassword, user.passwordHash, user.passwordHistory))
    throw new ServiceError("password_reused");

  await ctx.db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hashPassword(newPassword),
        passwordHistory: nextHistory(user.passwordHash, user.passwordHistory),
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
    });
    await logAudit(
      { ...auditBase(ctx), action: "user.password.change", entityType: "User", entityId: user.id },
      tx,
    );
  });
}

export async function setOwnLocale(ctx: ServiceContext, locale: string) {
  await ctx.db.user.update({ where: { id: ctx.actor.id }, data: { locale } });
}
