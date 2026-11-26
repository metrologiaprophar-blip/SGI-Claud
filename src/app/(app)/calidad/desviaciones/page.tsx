import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { DeviationStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { ListFilters, type ListSearch } from "@/components/quality/list-filters";
import { StatusBadge } from "@/components/quality/status-badge";
import { Card, PageHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { listProcesses } from "@/features/documents/service";
import { reportDeviationAction } from "@/features/deviations/actions";
import { listDeviations } from "@/features/deviations/service";
import { orgTimezone } from "@/features/quality/shared";
import { todayInZone } from "@/lib/dates";
import { getServiceContext } from "@/server/action";

const STATUSES: DeviationStatus[] = [
  "REPORTED",
  "UNDER_INVESTIGATION",
  "PENDING_QA",
  "CLOSED",
  "CANCELLED",
];
const CATEGORIES = [
  "PROCESS",
  "EQUIPMENT",
  "MATERIAL",
  "DOCUMENTATION",
  "ENVIRONMENT",
  "PERSONNEL",
  "STORAGE_TRANSPORT",
  "LABORATORY",
  "COMPUTERIZED_SYSTEM",
  "OTHER",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("deviations") };
}

export default async function DeviationsPage({
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
  const [rows, processes, tz] = await Promise.all([
    listDeviations(ctx.db, {
      status,
      q: search.q,
      open: !status && view === "abiertos",
      mineUserId: view === "mios" ? ctx.actor.id : undefined,
    }),
    listProcesses(ctx.db),
    orgTimezone(ctx),
  ]);
  const today = todayInZone(tz);
  const now = new Date();

  return (
    <>
      <PageHeader
        title={t("nav.tools.deviations")}
        subtitle={t("nav.toolDescriptions.deviations")}
        actions={
          <ModalButton
            label={t("quality.deviation.new")}
            title={t("quality.deviation.new")}
            testId="new-deviation"
          >
            <ActionForm
              id="report-deviation"
              action={reportDeviationAction}
              submitLabel={t("quality.deviation.new")}
            >
              <Field id="rd-title" label={t("quality.deviation.fields.title")}>
                <Input id="rd-title" name="title" required minLength={3} maxLength={200} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="rd-category" label={t("quality.deviation.fields.category")}>
                  <Select id="rd-category" name="category" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`quality.deviation.category.${c}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="rd-process" label={t("quality.deviation.fields.process")}>
                  <Select id="rd-process" name="processId" required defaultValue="">
                    <option value="" disabled>
                      —
                    </option>
                    {processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.code} · {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="rd-detected" label={t("quality.deviation.fields.detectedAt")}>
                  <Input
                    id="rd-detected"
                    name="detectedAt"
                    type="date"
                    max={today}
                    defaultValue={today}
                    required
                  />
                </Field>
              </div>
              <Field id="rd-description" label={t("quality.deviation.fields.description")}>
                <Textarea
                  id="rd-description"
                  name="description"
                  required
                  minLength={10}
                  maxLength={4000}
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="rd-location" label={t("quality.deviation.fields.location")}>
                  <Input id="rd-location" name="location" maxLength={200} />
                </Field>
                <Field id="rd-batches" label={t("quality.deviation.fields.batches")}>
                  <Input id="rd-batches" name="batches" maxLength={500} />
                </Field>
              </div>
              <Field id="rd-immediate" label={t("quality.deviation.fields.immediateAction")}>
                <Textarea
                  id="rd-immediate"
                  name="immediateAction"
                  required
                  minLength={3}
                  maxLength={2000}
                />
              </Field>
            </ActionForm>
          </ModalButton>
        }
      />
      <ListFilters
        basePath="/calidad/desviaciones"
        search={search}
        statuses={STATUSES.map((s) => ({ value: s, label: t(`quality.deviation.status.${s}`) }))}
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
              <th className="px-4 py-3">{t("quality.deviation.fields.classification")}</th>
              <th className="px-4 py-3">{t("quality.common.status")}</th>
              <th className="px-4 py-3">{t("quality.deviation.fields.investigator")}</th>
              <th className="px-4 py-3">{t("quality.common.dueDate")}</th>
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
            {rows.map((d) => {
              const overdue =
                d.dueDate &&
                d.dueDate < now &&
                ["UNDER_INVESTIGATION", "PENDING_QA"].includes(d.status);
              return (
                <tr
                  key={d.id}
                  className="align-top hover:bg-slate-50"
                  data-testid={`deviation-row-${d.code}`}
                >
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                    <Link
                      href={`/calidad/desviaciones/${d.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {d.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/calidad/desviaciones/${d.id}`}
                      className="hover:text-brand-800 font-medium text-slate-900"
                    >
                      {d.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {d.process.code} · {t(`quality.deviation.category.${d.category}`)} ·{" "}
                      {format.dateTime(d.detectedAt, { dateStyle: "medium" })}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {d.classification ? (
                      <StatusBadge
                        value={d.classification}
                        label={t(`quality.classification.${d.classification}`)}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge
                      value={d.status}
                      label={t(`quality.deviation.status.${d.status}`)}
                    />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{d.investigator?.fullName ?? "—"}</td>
                  <td
                    className={`px-4 py-3 whitespace-nowrap ${overdue ? "font-semibold text-red-700" : ""}`}
                  >
                    {d.dueDate ? format.dateTime(d.dueDate, { dateStyle: "medium" }) : "—"}
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
