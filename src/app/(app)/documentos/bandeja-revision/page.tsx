import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { getInbox } from "@/features/documents/service";
import { getServiceContext } from "@/server/action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents.inbox");
  return { title: t("title") };
}

type Row = {
  key: string;
  documentId: string;
  code: string;
  title: string;
  version: number;
  extra?: string;
};

export default async function InboxPage() {
  const ctx = await getServiceContext();
  const inbox = await getInbox(ctx);
  const t = await getTranslations("documents");
  const format = await getFormatter();
  const date = (d: Date | null) => (d ? format.dateTime(d, { dateStyle: "medium" }) : "");

  const sections: {
    key: string;
    title: string;
    rows: Row[];
    tone: "warning" | "brand" | "neutral" | "danger";
  }[] = [
    {
      key: "toReview",
      title: t("inbox.toReview"),
      tone: "warning",
      rows: inbox.toReview.map((v) => ({
        key: v.id,
        documentId: v.document.id,
        code: v.document.code,
        title: v.document.title,
        version: v.version,
        extra: v.author.fullName,
      })),
    },
    {
      key: "toApprove",
      title: t("inbox.toApprove"),
      tone: "warning",
      rows: inbox.toApprove.map((v) => ({
        key: v.id,
        documentId: v.document.id,
        code: v.document.code,
        title: v.document.title,
        version: v.version,
        extra: v.author.fullName,
      })),
    },
    {
      key: "reads",
      title: t("inbox.reads"),
      tone: "brand",
      rows: inbox.reads.map((r) => ({
        key: r.id,
        documentId: r.version.document.id,
        code: r.version.document.code,
        title: r.version.document.title,
        version: r.version.version,
        extra: r.dueDate ? t("inbox.due", { date: date(r.dueDate) }) : undefined,
      })),
    },
    {
      key: "drafts",
      title: t("inbox.drafts"),
      tone: "neutral",
      rows: inbox.drafts.map((v) => ({
        key: v.id,
        documentId: v.document.id,
        code: v.document.code,
        title: v.document.title,
        version: v.version,
        extra: v.lastRejection ? t("detail.rejected") : undefined,
      })),
    },
    {
      key: "dueReview",
      title: t("inbox.dueReview"),
      tone: "danger",
      rows: inbox.dueReview.map((v) => ({
        key: v.id,
        documentId: v.document.id,
        code: v.document.code,
        title: v.document.title,
        version: v.version,
        extra: t("inbox.due", { date: date(v.nextReviewDate) }),
      })),
    },
  ];

  return (
    <>
      <PageHeader title={t("inbox.title")} subtitle={t("inbox.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.key} className="p-5" data-testid={`inbox-${section.key}`}>
            <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
              {section.title}
              <Badge tone={section.rows.length ? section.tone : "neutral"}>
                {section.rows.length}
              </Badge>
            </h2>
            {section.rows.length === 0 ? (
              <p className="text-sm text-slate-500">{t("inbox.empty")}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {section.rows.map((row) => (
                  <li key={row.key}>
                    <Link
                      href={`/documentos/doc/${row.documentId}`}
                      className="hover:text-brand-800 flex items-center justify-between gap-3 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="text-brand-700 font-mono text-sm font-semibold">
                          {row.code} · v{row.version}
                        </span>
                        <span className="block truncate text-sm text-slate-800">{row.title}</span>
                      </span>
                      {row.extra && (
                        <span className="shrink-0 text-xs text-slate-500">{row.extra}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </>
  );
}
