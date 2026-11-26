import { Prisma } from "@prisma/client";
import { ServiceError } from "@/lib/errors";
import { startOfDayInZone, todayInZone } from "@/lib/dates";
import type { ServiceContext } from "@/server/context";
import type { TenantDb } from "@/server/db/tenant-client";

export type Tx = Parameters<Parameters<TenantDb["$transaction"]>[0]>[0];
export type CodedModel =
  "deviation" | "capa" | "changeControl" | "calibration" | "qualification" | "proficiencyTest";

type CodeDelegate = {
  findFirst(args: {
    where: { code: { startsWith: string } };
    select: { code: true };
    orderBy: { code: "desc" };
  }): Promise<{ code: string } | null>;
};

/** Siguiente código correlativo por empresa y año: DEV-2026-0001, CAPA-2026-0001, CAL-2026-0001… */
export async function nextCode(tx: Tx, model: CodedModel, prefix: string, now = new Date()) {
  const base = `${prefix}-${now.getUTCFullYear()}-`;
  const delegate = tx[model] as unknown as CodeDelegate;
  const last = await delegate.findFirst({
    where: { code: { startsWith: base } },
    select: { code: true },
    orderBy: { code: "desc" },
  });
  const n = last ? Number.parseInt(last.code.slice(base.length), 10) + 1 : 1;
  return `${base}${String(n).padStart(4, "0")}`;
}

/** Reintenta una alta si dos personas obtuvieron el mismo correlativo a la vez. */
export async function withCodeRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const dup = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (!dup || i >= attempts - 1) throw e;
    }
  }
}

export async function orgTimezone(ctx: ServiceContext) {
  const org = await ctx.db.organization.findUnique({
    where: { id: ctx.actor.organizationId },
    select: { timezone: true },
  });
  return org?.timezone ?? "America/Guayaquil";
}

/** "AAAA-MM-DD" → fecha en la zona de la empresa. `notPast` impide fechas anteriores a hoy. */
export async function parseDay(
  ctx: ServiceContext,
  value: string,
  opts: { notPast?: boolean; notFuture?: boolean } = {},
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ServiceError("invalid_date");
  const tz = await orgTimezone(ctx);
  const today = todayInZone(tz);
  if (opts.notPast && value < today) throw new ServiceError("date_in_past");
  if (opts.notFuture && value > today) throw new ServiceError("date_in_future");
  return startOfDayInZone(value, tz);
}

/** Valida que el usuario exista en la empresa (cliente de empresa) y esté activo. */
export async function requireActiveUser(db: TenantDb | Tx, userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, status: true, fullName: true },
  });
  if (!user || user.status !== "ACTIVE") throw new ServiceError("invalid_user");
  return user;
}

export function requireText(value: string | null | undefined, code = "required_fields", min = 3) {
  if (!value || value.trim().length < min) throw new ServiceError(code);
  return value.trim();
}

export const SIGNATURE_ENTITY = {
  deviation: "Deviation",
  capa: "Capa",
  change: "ChangeControl",
} as const;
