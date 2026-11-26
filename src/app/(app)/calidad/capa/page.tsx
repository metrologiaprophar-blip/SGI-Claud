import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { CapaStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { CapaFormFields } from "@/components/quality/capa-form-fields";
import { ListFilters, type ListSearch } from "@/components/quality/list-filters";
import { StatusBadge } from "@/components/quality/status-badge";
import { Card, PageHeader } from "@/components/ui/card";
import { createCapaAction } from "@/features/capa/actions";
import { listCapas } from "@/features/capa/service";
import { listAssignableUsers } from "@/features/documents/service";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

const STATUSES: CapaStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "EFFECTIVENESS_CHECK",
  "CLOSED",
  "CANCELLED",
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("capa") };
}

export default async function CapaListPage({
  searchParams,
}: {
  searchParams: Promise<ListSearch>;
}) {
  const search = await searchParams;
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const format = await getFormatter();
  const status = STATUSES.find((s) => s === search.estado);
  const view = search.ver ?? "abiertos";
  const [rows, qa, users, tz] = await Promise.all([
    listCapas(ctx.db, {
      status,
      q: search.q,
      open: !status && view === "abiertos",
      mineUserId: view === "mios" ? ctx.actor.id : undefined,
    }),
    hasPermission(ctx, "QA_APPROVE"),
    listAssignableUsers(ctx.db),
    orgTimezone(ctx),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader
        title={t("nav.tools.capa")}
        subtitle={t("nav.toolDescriptions.capa")}
        actions={
          qa ? (
            <ModalButton
              label={t("quality.capa.new")}
              title={t("quality.capa.new")}
              testId="new-capa"
            >
              <ActionForm
                id="new-capa"
                action={createCapaAction}
                submitLabel={t("quality.capa.new")}
              >
                <CapaFormFields users={users} today={todayInZone(tz)} />
              </ActionForm>
            </ModalButton>
          ) : null
        }
      />
      <ListFilters
        basePath="/calidad/capa"
        search={search}
        statuses={STATUSES.map((s) => ({ value: s, label: t(`quality.capa.status.${s}`) }))}
      />
      <p className="mb-2 text-sm text-slate-500">
        {t("quality.common.count", { count: rows.length })}
      </p>
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{t("quality.common.code")}</th>
              <th className="px-4 py-3">{t("quality.common.title")}</th>
              <th className="px-4 py-3">{t("quality.common.status")}</th>
              <th className="px-4 py-3">{t("quality.common.owner")}</th>
              <th className="px-4 py-3">{t("quality.actions.title")}</th>
              <th className="px-4 py-3">{t("quality.capa.fields.targetDate")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {t("quality.common.empty")}
                </td>
              </tr>
            )}
            {rows.map((c) => {
              const overdue = c.targetDate < now && !["CLOSED", "CANCELLED"].includes(c.status);
              const done = c.actions.filter((a) => a.status !== "PENDING").length;
              return (
                <tr
                  key={c.id}
                  className="align-top hover:bg-slate-50"
                  data-testid={`capa-row-${c.code}`}
                >
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                    <Link href={`/calidad/capa/${c.id}`} className="text-brand-700 hover:underline">
                      {c.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/calidad/capa/${c.id}`}
                      className="hover:text-brand-800 font-medium text-slate-900"
                    >
                      {c.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {t(`quality.capa.source.${c.source}`)}
                      {c.deviation
                        ? ` · ${c.deviation.code}`
                        : c.sourceReference
                          ? ` · ${c.sourceReference}`
                          : ""}{" "}
                      · {t(`quality.capa.type.${c.type}`)}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge value={c.status} label={t(`quality.capa.status.${c.status}`)} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{c.owner.fullName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                    {done}/{c.actions.length}
                  </td>
                  <td
                    className={`px-4 py-3 whitespace-nowrap ${overdue ? "font-semibold text-red-700" : ""}`}
                  >
                    {format.dateTime(c.targetDate, { dateStyle: "medium" })}
                    {overdue && (
                      <span className="block text-xs">{t("quality.common.overdue")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
