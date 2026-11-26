import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import type { VersionStatus } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { todayInZone } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { CancelDraftButton } from "@/features/documents/components/cancel-draft-form";
import { DecisionForm } from "@/features/documents/components/decision-form";
import { NewVersionButton } from "@/features/documents/components/new-version-button";
import { ObsoleteButton } from "@/features/documents/components/obsolete-button";
import { ReadAckForm } from "@/features/documents/components/read-ack-form";
import { SubmitReviewForm } from "@/features/documents/components/submit-review-form";
import { UploadFileForm } from "@/features/documents/components/upload-file-form";
import { VersionStatusBadge } from "@/features/documents/components/version-status-badge";
import { getDocument, listAssignableUsers, OPEN_STATUSES } from "@/features/documents/service";
import { getServiceContext } from "@/server/action";
import { permissionsOf } from "@/server/permissions";
import { verifySignatureHash } from "@/server/signatures";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const ctx = await getServiceContext();
  const doc = await ctx.db.document.findUnique({
    where: { id: (await params).id },
    select: { code: true },
  });
  return { title: doc?.code };
}

const STEPS: { key: string; statuses: VersionStatus[] }[] = [
  { key: "stepDraft", statuses: ["DRAFT"] },
  { key: "stepReview", statuses: ["IN_REVIEW"] },
  { key: "stepApproval", statuses: ["PENDING_APPROVAL"] },
  { key: "stepEffective", statuses: ["APPROVED", "EFFECTIVE"] },
];

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-5", className)}>
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {children}
    </Card>
  );
}

export default async function DocumentPage({ params }: Params) {
  const { id } = await params;
  const ctx = await getServiceContext();
  const doc = await getDocument(ctx.db, id);
  if (!doc) notFound();
  const t = await getTranslations();
  const format = await getFormatter();
  const me = ctx.actor.id;
  const [perms, users, org] = await Promise.all([
    permissionsOf(ctx.db, me),
    listAssignableUsers(ctx.db),
    ctx.db.organization.findUnique({
      where: { id: ctx.actor.organizationId },
      select: { timezone: true },
    }),
  ]);
  const canManage = perms.includes("DOC_MANAGE");
  const canApprove = perms.includes("DOC_APPROVE");
  const date = (d: Date | null | undefined) =>
    d ? format.dateTime(d, { dateStyle: "medium" }) : t("common.none");
  const dateTime = (d: Date) => format.dateTime(d, { dateStyle: "medium", timeStyle: "short" });
  const vs = (s: VersionStatus) => t(`documents.versionStatus.${s}`);

  const current = doc.versions.find((v) => v.status === "EFFECTIVE" || v.status === "OBSOLETE");
  const open = doc.versions.find((v) => OPEN_STATUSES.includes(v.status));
  const myRead =
    current?.status === "EFFECTIVE"
      ? current.reads.find((r) => r.userId === me && !r.acknowledgedAt)
      : undefined;
  const canDownload = (v: (typeof doc.versions)[number]) =>
    !!v.storageKey &&
    (v.status === "EFFECTIVE" ||
      canManage ||
      [v.authorId, v.reviewerId, v.approverId].includes(me));
  const standards = Array.isArray(doc.standards) ? (doc.standards as string[]) : [];

  return (
    <div className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-brand-700 font-mono text-sm font-semibold">{doc.code}</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{doc.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <Badge tone="brand">{t(`documents.types.${doc.type}`)}</Badge>
            {doc.status === "OBSOLETE" ? (
              <Badge tone="danger">
                {t("documents.detail.obsoleteSince", { date: date(doc.obsoletedAt) })}
              </Badge>
            ) : null}
            <span>
              {doc.process.code} · {doc.process.name}
            </span>
            <span>· {doc.owner.fullName}</span>
          </div>
        </div>
        {doc.status === "ACTIVE" && (
          <div className="flex flex-wrap gap-2">
            {!open && (canManage || doc.owner.id === me) && current && (
              <NewVersionButton documentId={doc.id} />
            )}
            {canApprove &&
              !doc.versions.some((v) =>
                ["IN_REVIEW", "PENDING_APPROVAL", "APPROVED"].includes(v.status),
              ) && <ObsoleteButton documentId={doc.id} />}
          </div>
        )}
      </div>

      <Alert tone="warning">{t("documents.detail.uncontrolled")}</Alert>

      {myRead && current && (
        <Section title={t("documents.read.title")} className="border-amber-300">
          <ReadAckForm versionId={current.id} documentId={doc.id} />
        </Section>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        {/* Versión vigente */}
        <Section title={t("documents.detail.currentVersion")} className="xl:col-span-2">
          {current ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-lg font-bold">v{current.version}</span>
                <VersionStatusBadge status={current.status} label={vs(current.status)} />
                {canDownload(current) && (
                  <a
                    href={`/api/files/version/${current.id}`}
                    className={buttonClass("outline", "sm")}
                    data-testid="download-current"
                  >
                    <Icon name="download" className="size-4" />
                    {t("documents.detail.download")}
                  </a>
                )}
              </div>
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-slate-500">{t("documents.list.effectiveDate")}</dt>
                  <dd className="font-medium">{date(current.effectiveDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{t("documents.list.nextReview")}</dt>
                  <dd className="font-medium">{date(current.nextReviewDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">{t("documents.detail.file")}</dt>
                  <dd className="truncate font-medium">
                    {current.fileName ?? t("documents.detail.noFile")}
                  </dd>
                </div>
              </dl>
              <p className="text-slate-600">
                <span className="text-xs text-slate-500">
                  {t("documents.detail.changeSummary")}:{" "}
                </span>
                {current.changeSummary}
              </p>
              {current.reads.length > 0 && (
                <p className="text-xs text-slate-500">
                  {t("documents.detail.readProgress", {
                    done: current.reads.filter((r) => r.acknowledgedAt).length,
                    total: current.reads.length,
                  })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t("documents.detail.noCurrent")}</p>
          )}
        </Section>

        {/* Datos */}
        <Section title={t("documents.detail.info")}>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">{t("documents.detail.standards")}</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {standards.length
                  ? standards.map((s) => (
                      <Badge key={s} tone="brand">
                        {t(`nav.standards.${s}`)}
                      </Badge>
                    ))
                  : t("common.none")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("documents.form.reviewPeriod")}</dt>
              <dd className="font-medium">
                {t("documents.detail.reviewPeriodValue", { months: doc.reviewPeriodMonths })}
              </dd>
            </div>
            {doc.obsoleteReason && (
              <div>
                <dt className="text-xs text-slate-500">{t("documents.detail.reason")}</dt>
                <dd>{doc.obsoleteReason}</dd>
              </div>
            )}
          </dl>
        </Section>
      </div>

      {/* Versión en curso */}
      {open && (
        <Section title={`${t("documents.detail.inProgress")} · v${open.version}`}>
          <ol
            className="mb-5 grid grid-cols-4 gap-2 text-xs font-semibold"
            aria-label={t("documents.detail.inProgress")}
          >
            {STEPS.map((step, i) => {
              const currentIndex = STEPS.findIndex((s) => s.statuses.includes(open.status));
              const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
              return (
                <li
                  key={step.key}
                  aria-current={state === "current" ? "step" : undefined}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-center",
                    state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-800",
                    state === "current" && "border-brand-300 bg-brand-50 text-brand-800",
                    state === "todo" && "border-slate-200 text-slate-400",
                  )}
                >
                  {t(`documents.detail.${step.key}`)}
                </li>
              );
            })}
          </ol>

          <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-slate-500">{t("documents.detail.author")}</dt>
              <dd className="font-medium">{open.author.fullName}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("documents.detail.reviewer")}</dt>
              <dd className="font-medium">{open.reviewer?.fullName ?? t("common.none")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("documents.detail.approver")}</dt>
              <dd className="font-medium">{open.approver?.fullName ?? t("common.none")}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">{t("documents.detail.file")}</dt>
              <dd className="flex items-center gap-2 font-medium">
                <span className="truncate">{open.fileName ?? t("documents.detail.noFile")}</span>
                {canDownload(open) && (
                  <a
                    href={`/api/files/version/${open.id}`}
                    className="text-brand-700 hover:underline"
                    aria-label={t("documents.detail.download")}
                  >
                    <Icon name="download" className="size-4" />
                  </a>
                )}
              </dd>
            </div>
          </dl>
          <p className="mb-4 text-sm text-slate-600">
            <span className="text-xs text-slate-500">{t("documents.detail.changeSummary")}: </span>
            {open.changeSummary}
          </p>

          {open.lastRejection && open.status === "DRAFT" && (
            <Alert tone="warning" className="mb-4">
              <strong>{t("documents.detail.rejected")}:</strong> {open.lastRejection}
            </Alert>
          )}

          {open.status === "DRAFT" && open.authorId === me && (
            <div className="space-y-6">
              <UploadFileForm versionId={open.id} documentId={doc.id} hasFile={!!open.storageKey} />
              {open.storageKey && (
                <div className="border-t border-slate-100 pt-5">
                  <h3 className="mb-3 font-semibold text-slate-900">
                    {t("documents.submit.title")}
                  </h3>
                  <SubmitReviewForm
                    versionId={open.id}
                    documentId={doc.id}
                    users={users}
                    currentUserId={me}
                    defaultSummary={open.changeSummary}
                    today={todayInZone(org?.timezone ?? "America/Guayaquil")}
                  />
                </div>
              )}
              <div className="flex justify-end">
                <CancelDraftButton versionId={open.id} documentId={doc.id} />
              </div>
            </div>
          )}
          {open.status === "IN_REVIEW" &&
            (open.reviewerId === me ? (
              <>
                <h3 className="mb-3 font-semibold text-slate-900">
                  {t("documents.decision.reviewTitle")}
                </h3>
                <DecisionForm versionId={open.id} documentId={doc.id} stage="review" />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {t("documents.detail.waiting", { name: open.reviewer?.fullName ?? "" })}
              </p>
            ))}
          {open.status === "PENDING_APPROVAL" &&
            (open.approverId === me ? (
              <>
                <h3 className="mb-3 font-semibold text-slate-900">
                  {t("documents.decision.approvalTitle")}
                </h3>
                <DecisionForm versionId={open.id} documentId={doc.id} stage="approval" />
              </>
            ) : (
              <p className="text-sm text-slate-500">
                {t("documents.detail.waiting", { name: open.approver?.fullName ?? "" })}
              </p>
            ))}
          {open.status === "APPROVED" && (
            <Alert tone="info">
              {t("documents.detail.plannedEffective", { date: date(open.effectiveDate) })}
            </Alert>
          )}
          {open.status === "DRAFT" && open.authorId !== me && (
            <p className="text-sm text-slate-500">
              {t("documents.detail.waiting", { name: open.author.fullName })}
            </p>
          )}
        </Section>
      )}

      {/* Historial */}
      <Section title={t("documents.detail.history")}>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="py-2 pr-4">{t("documents.list.version")}</th>
                <th className="py-2 pr-4">{t("documents.list.status")}</th>
                <th className="py-2 pr-4">{t("documents.detail.changeSummary")}</th>
                <th className="py-2 pr-4">{t("documents.detail.author")}</th>
                <th className="py-2 pr-4">{t("documents.list.effectiveDate")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doc.versions.map((v) => (
                <tr key={v.id} className="align-top" data-testid={`version-row-${v.version}`}>
                  <td className="py-2 pr-4 font-mono font-semibold">v{v.version}</td>
                  <td className="py-2 pr-4">
                    <VersionStatusBadge status={v.status} label={vs(v.status)} />
                  </td>
                  <td className="py-2 pr-4 text-slate-700">
                    {v.changeSummary}
                    {v.cancelReason && (
                      <span className="block text-xs text-slate-500">{v.cancelReason}</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">{v.author.fullName}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{date(v.effectiveDate)}</td>
                  <td className="py-2 text-right">
                    {canDownload(v) && (
                      <a
                        href={`/api/files/version/${v.id}`}
                        className="text-brand-700 hover:underline"
                        aria-label={`${t("documents.detail.download")} v${v.version}`}
                      >
                        <Icon name="download" className="size-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Firmas */}
      <Section title={t("documents.detail.signatures")}>
        {doc.signatures.length === 0 ? (
          <p className="text-sm text-slate-500">{t("common.none")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-slate-200 text-sm"
              data-testid="signatures-table"
            >
              <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">{t("documents.signaturesPage.date")}</th>
                  <th className="py-2 pr-4">{t("admin.audit.actor")}</th>
                  <th className="py-2 pr-4">{t("documents.signaturesPage.meaning")}</th>
                  <th className="py-2 pr-4">{t("documents.list.version")}</th>
                  <th className="py-2 pr-4">{t("documents.signaturesPage.comment")}</th>
                  <th className="py-2">{t("documents.detail.fingerprint")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doc.signatures.map((s) => {
                  const ok = verifySignatureHash(s);
                  const version = doc.versions.find((v) => v.id === s.entityId);
                  return (
                    <tr key={s.id} className="align-top">
                      <td className="py-2 pr-4 whitespace-nowrap">{dateTime(s.signedAt)}</td>
                      <td className="py-2 pr-4">
                        {s.userFullName}
                        {s.userJobTitle && (
                          <span className="block text-xs text-slate-500">{s.userJobTitle}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 font-medium">
                        {t(`documents.meanings.${s.meaning}`)}
                      </td>
                      <td className="py-2 pr-4 font-mono">
                        {version ? `v${version.version}` : t("common.none")}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">{s.comment ?? ""}</td>
                      <td className="py-2 whitespace-nowrap">
                        <span
                          className="font-mono text-xs text-slate-500"
                          title={s.contentHash ?? ""}
                        >
                          {s.contentHash ? `${s.contentHash.slice(0, 12)}…` : t("common.none")}
                        </span>
                        <Badge tone={ok ? "success" : "danger"} className="ml-2">
                          {ok
                            ? t("documents.detail.integrityOk")
                            : t("documents.detail.integrityFail")}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Link
        href="/documentos/listado-maestro"
        className="text-brand-700 inline-flex items-center gap-1 text-sm font-semibold hover:underline"
      >
        ← {t("nav.tools.masterList")}
      </Link>
    </div>
  );
}
