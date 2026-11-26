import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { listAuditActionPrefixes, listAuditLogs } from "@/features/audit/service";
import { requireRole } from "@/server/auth/guards";
import { getTenantDb } from "@/server/db/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin.audit");
  return { title: t("title") };
}

type Search = {
  accion?: string;
  usuario?: string;
  desde?: string;
  hasta?: string;
  pagina?: string;
};

const parseDate = (v?: string, endOfDay = false) => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
  const d = new Date(`${v}T${endOfDay ? "23:59:59.999" : "00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

function JsonValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return <span>{String(value)}</span>;
  return (
    <ul className="space-y-0.5">
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <li key={k}>
          <span className="text-slate-500">{k}:</span>{" "}
          <span className="font-mono">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function AuditTrailPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  const sp = await searchParams;
  const db = await getTenantDb();
  const t = await getTranslations();
  const format = await getFormatter();
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const [result, prefixes] = await Promise.all([
    listAuditLogs(db, {
      action: sp.accion,
      actor: sp.usuario?.trim(),
      from: parseDate(sp.desde),
      to: parseDate(sp.hasta, true),
      page,
    }),
    listAuditActionPrefixes(db),
  ]);
  const pageHref = (p: number) => {
    const q = new URLSearchParams(
      Object.entries({ ...sp, pagina: String(p) }).filter(([, v]) => v) as [string, string][],
    );
    return `/admin/auditoria?${q.toString()}`;
  };
  const actionLabel = (a: string) => (t.has(`auditActions.${a}`) ? t(`auditActions.${a}`) : a);

  return (
    <>
      <PageHeader title={t("admin.audit.title")} subtitle={t("admin.audit.subtitle")} />
      <Card className="mb-4 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" method="get">
          <Select name="accion" defaultValue={sp.accion ?? ""} aria-label={t("admin.audit.action")}>
            <option value="">{t("admin.audit.allActions")}</option>
            {prefixes.map((p) => (
              <option key={p} value={`${p}.`}>
                {t.has(`auditGroups.${p}`) ? t(`auditGroups.${p}`) : p}
              </option>
            ))}
          </Select>
          <Input
            name="usuario"
            defaultValue={sp.usuario ?? ""}
            placeholder={t("admin.audit.actorSearch")}
            aria-label={t("admin.audit.actorSearch")}
          />
          <Input
            type="date"
            name="desde"
            defaultValue={sp.desde ?? ""}
            aria-label={t("admin.audit.from")}
            title={t("admin.audit.from")}
          />
          <Input
            type="date"
            name="hasta"
            defaultValue={sp.hasta ?? ""}
            aria-label={t("admin.audit.to")}
            title={t("admin.audit.to")}
          />
          <div className="flex gap-2">
            <button type="submit" className={buttonClass("primary", "md", "flex-1")}>
              {t("common.filter")}
            </button>
            <Link href="/admin/auditoria" className={buttonClass("outline", "md")}>
              {t("common.clear")}
            </Link>
          </div>
        </form>
      </Card>

      <p className="mb-2 text-sm text-slate-500">
        {t("admin.audit.total", { count: result.total })}
      </p>
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{t("admin.audit.date")}</th>
              <th className="px-4 py-3">{t("admin.audit.actor")}</th>
              <th className="px-4 py-3">{t("admin.audit.action")}</th>
              <th className="px-4 py-3">{t("admin.audit.changes")}</th>
              <th className="px-4 py-3">{t("admin.audit.origin")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {result.items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {t("admin.audit.empty")}
                </td>
              </tr>
            )}
            {result.items.map((log) => (
              <tr key={log.id} data-testid="audit-row">
                <td className="px-4 py-3 whitespace-nowrap">
                  {format.dateTime(log.createdAt, { dateStyle: "short", timeStyle: "medium" })}
                </td>
                <td className="px-4 py-3">{log.actorName ?? t("common.none")}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-900">{actionLabel(log.action)}</p>
                  <p className="font-mono text-xs text-slate-400">{log.action}</p>
                </td>
                <td className="max-w-md px-4 py-3 text-xs">
                  {log.before != null && (
                    <div className="mb-1">
                      <span className="font-semibold text-red-700">{t("admin.audit.before")}</span>
                      <JsonValue value={log.before} />
                    </div>
                  )}
                  {log.after != null && (
                    <div>
                      <span className="font-semibold text-emerald-700">
                        {t("admin.audit.after")}
                      </span>
                      <JsonValue value={log.after} />
                    </div>
                  )}
                  {log.reason && (
                    <p className="mt-1">
                      <span className="font-semibold">{t("admin.audit.reason")}:</span> {log.reason}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">
                  {log.ip ?? t("common.none")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {result.pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
          {result.page > 1 ? (
            <Link className={buttonClass("outline", "sm")} href={pageHref(result.page - 1)}>
              {t("common.previous")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-500">
            {t("common.page", { page: result.page, pages: result.pages })}
          </span>
          {result.page < result.pages ? (
            <Link className={buttonClass("outline", "sm")} href={pageHref(result.page + 1)}>
              {t("common.next")}
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
