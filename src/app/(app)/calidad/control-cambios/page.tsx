import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { ChangeStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { ChangeFormFields } from "@/components/quality/change-form-fields";
import { ListFilters, type ListSearch } from "@/components/quality/list-filters";
import { StatusBadge } from "@/components/quality/status-badge";
import { Card, PageHeader } from "@/components/ui/card";
import { createChangeAction } from "@/features/change-control/actions";
import { listChanges } from "@/features/change-control/service";
import { listProcesses } from "@/features/documents/service";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";

const STATUSES: ChangeStatus[] = [
  "DRAFT",
  "IN_ASSESSMENT",
  "APPROVED",
  "IMPLEMENTED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("changeControl") };
}

export default async function ChangesPage({ searchParams }: { searchParams: Promise<ListSearch> }) {
  const search = await searchParams;
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const format = await getFormatter();
  const status = STATUSES.find((s) => s === search.estado);
  const view = search.ver ?? "abiertos";
  const [rows, processes, tz] = await Promise.all([
    listChanges(ctx.db, {
      status,
      q: search.q,
      open: !status && view === "abiertos",
      mineUserId: view === "mios" ? ctx.actor.id : undefined,
    }),
    listProcesses(ctx.db),
    orgTimezone(ctx),
  ]);

  return (
    <>
      <PageHeader
        title={t("nav.tools.changeControl")}
        subtitle={t("nav.toolDescriptions.changeControl")}
        actions={
          <ModalButton
            label={t("quality.change.new")}
            title={t("quality.change.new")}
            testId="new-change"
          >
            <ActionForm
              id="new-change"
              action={createChangeAction}
              submitLabel={t("quality.change.new")}
            >
              <ChangeFormFields processes={processes} today={todayInZone(tz)} />
            </ActionForm>
          </ModalButton>
        }
      />
      <ListFilters
        basePath="/calidad/control-cambios"
        search={search}
        statuses={STATUSES.map((s) => ({ value: s, label: t(`quality.change.status.${s}`) }))}
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
              <th className="px-4 py-3">{t("quality.change.fields.classification")}</th>
              <th className="px-4 py-3">{t("quality.change.fields.requester")}</th>
              <th className="px-4 py-3">{t("quality.change.fields.plannedDate")}</th>
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
            {rows.map((c) => (
              <tr
                key={c.id}
                className="align-top hover:bg-slate-50"
                data-testid={`change-row-${c.code}`}
              >
                <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                  <Link
                    href={`/calidad/control-cambios/${c.id}`}
                    className="text-brand-700 hover:underline"
                  >
                    {c.code}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/calidad/control-cambios/${c.id}`}
                    className="hover:text-brand-800 font-medium text-slate-900"
                  >
                    {c.title}
                  </Link>
                  <p className="text-xs text-slate-500">
                    {c.process.code} · {t(`quality.change.type.${c.changeType}`)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge value={c.status} label={t(`quality.change.status.${c.status}`)} />
                </td>
                <td className="px-4 py-3">
                  {c.classification ? (
                    <StatusBadge
                      value={c.classification}
                      label={t(`quality.classification.${c.classification}`)}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{c.requester.fullName}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {c.plannedDate ? format.dateTime(c.plannedDate, { dateStyle: "medium" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
