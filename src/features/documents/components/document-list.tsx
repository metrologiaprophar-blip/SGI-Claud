import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { DocumentType } from "@prisma/client";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { STANDARDS } from "@/config/navigation";
import { hasPermission } from "@/server/permissions";
import { getServiceContext } from "@/server/action";
import { listAssignableUsers, listDocuments, listProcesses } from "../service";
import { CreateDocumentButton } from "./create-document-button";
import { VersionStatusBadge } from "./version-status-badge";

const ALL_TYPES: DocumentType[] = [
  "MANUAL",
  "POLICY",
  "SOP",
  "INSTRUCTION",
  "SPECIFICATION",
  "FORM",
  "PLAN",
  "OTHER",
];

export type DocumentListSearch = {
  q?: string;
  tipo?: string;
  proceso?: string;
  norma?: string;
  obsoletos?: string;
};

/** Listado de documentos controlados (listado maestro o filtrado por tipos). */
export async function DocumentList({
  toolKey,
  types,
  basePath,
  search,
}: {
  toolKey: string;
  types?: DocumentType[];
  basePath: string;
  search: DocumentListSearch;
}) {
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const format = await getFormatter();
  const typeFilter = types ?? ALL_TYPES;
  const selectedType = typeFilter.find((x) => x === search.tipo);
  const [docs, processes, users, canManage] = await Promise.all([
    listDocuments(ctx.db, {
      ...(selectedType ? { type: selectedType } : { types: typeFilter }),
      processId: search.proceso || undefined,
      q: search.q,
      standard: search.norma || undefined,
      includeObsolete: search.obsoletos === "1",
    }),
    listProcesses(ctx.db),
    listAssignableUsers(ctx.db),
    hasPermission(ctx, "DOC_MANAGE"),
  ]);
  const now = new Date();
  const fmt = (d: Date | null | undefined) =>
    d ? format.dateTime(d, { dateStyle: "medium" }) : t("common.none");

  return (
    <>
      <PageHeader
        title={t(`nav.tools.${toolKey}`)}
        subtitle={t(`nav.toolDescriptions.${toolKey}`)}
        actions={
          canManage ? (
            <CreateDocumentButton
              processes={processes.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }))}
              users={users.map((u) => ({ id: u.id, label: u.fullName }))}
              types={typeFilter}
              currentUserId={ctx.actor.id}
            />
          ) : null
        }
      />
      <Card className="mb-4 p-4">
        <form method="get" action={basePath} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Input
            name="q"
            defaultValue={search.q ?? ""}
            placeholder={t("documents.list.search")}
            aria-label={t("documents.list.search")}
            className="lg:col-span-2"
          />
          {typeFilter.length > 1 && (
            <Select
              name="tipo"
              defaultValue={selectedType ?? ""}
              aria-label={t("documents.list.type")}
            >
              <option value="">{t("documents.list.allTypes")}</option>
              {typeFilter.map((ty) => (
                <option key={ty} value={ty}>
                  {t(`documents.types.${ty}`)}
                </option>
              ))}
            </Select>
          )}
          <Select
            name="proceso"
            defaultValue={search.proceso ?? ""}
            aria-label={t("documents.list.process")}
          >
            <option value="">{t("documents.list.allProcesses")}</option>
            {processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </Select>
          <Select
            name="norma"
            defaultValue={search.norma ?? ""}
            aria-label={t("nav.standards.label")}
          >
            <option value="">{t("documents.list.allStandards")}</option>
            {STANDARDS.map((s) => (
              <option key={s} value={s}>
                {t(`nav.standards.${s}`)}
              </option>
            ))}
          </Select>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                name="obsoletos"
                value="1"
                defaultChecked={search.obsoletos === "1"}
                className="accent-brand-700"
              />
              {t("documents.list.showObsolete")}
            </label>
          </div>
          <div className="flex gap-2 lg:col-span-6 lg:justify-end">
            <button type="submit" className={buttonClass("primary", "md")}>
              {t("common.filter")}
            </button>
            <Link href={basePath} className={buttonClass("outline", "md")}>
              {t("common.clear")}
            </Link>
          </div>
        </form>
      </Card>

      <p className="mb-2 text-sm text-slate-500">
        {t("documents.list.count", { count: docs.length })}
      </p>
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{t("documents.list.code")}</th>
              <th className="px-4 py-3">{t("documents.list.title")}</th>
              <th className="px-4 py-3">{t("documents.list.process")}</th>
              <th className="px-4 py-3">{t("documents.list.version")}</th>
              <th className="px-4 py-3">{t("documents.list.effectiveDate")}</th>
              <th className="px-4 py-3">{t("documents.list.nextReview")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {docs.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  {t("documents.list.empty")}
                </td>
              </tr>
            )}
            {docs.map((d) => {
              const overdue =
                d.current?.status === "EFFECTIVE" &&
                d.current.nextReviewDate &&
                d.current.nextReviewDate < now;
              return (
                <tr
                  key={d.id}
                  className="align-top hover:bg-slate-50"
                  data-testid={`doc-row-${d.code}`}
                >
                  <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                    <Link
                      href={`/documentos/doc/${d.id}`}
                      className="text-brand-700 hover:underline"
                    >
                      {d.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/documentos/doc/${d.id}`}
                      className="hover:text-brand-800 font-medium text-slate-900"
                    >
                      {d.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {t(`documents.types.${d.type}`)} · {d.owner.fullName}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-600">{d.process.code}</td>
                  <td className="space-y-1 px-4 py-3">
                    {d.current ? (
                      <div className="flex items-center gap-2">
                        <span className="font-mono">v{d.current.version}</span>
                        <VersionStatusBadge
                          status={d.current.status}
                          label={t(`documents.versionStatus.${d.current.status}`)}
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {t("documents.list.noVersion")}
                      </span>
                    )}
                    {d.inProgress && (
                      <p className="text-xs text-amber-700">
                        {t("documents.list.inProgress", {
                          version: d.inProgress.version,
                          status: t(`documents.versionStatus.${d.inProgress.status}`),
                        })}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{fmt(d.current?.effectiveDate)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={overdue ? "font-semibold text-red-700" : undefined}>
                      {fmt(d.current?.nextReviewDate)}
                    </span>
                    {overdue && (
                      <p className="text-xs text-red-700">{t("documents.list.overdue")}</p>
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
