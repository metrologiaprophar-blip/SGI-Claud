import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, PageHeader } from "@/components/ui/card";
import { listMySignatures } from "@/features/documents/service";
import { getServiceContext } from "@/server/action";
import { verifySignatureHash } from "@/server/signatures";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("documents.signaturesPage");
  return { title: t("title") };
}

export default async function MySignaturesPage() {
  const ctx = await getServiceContext();
  const signatures = await listMySignatures(ctx.db, ctx.actor.id);
  const versionIds = signatures
    .filter((s) => s.entityType === "DocumentVersion")
    .map((s) => s.entityId);
  const documentIds = signatures.filter((s) => s.entityType === "Document").map((s) => s.entityId);
  const [versions, documents] = await Promise.all([
    ctx.db.documentVersion.findMany({
      where: { id: { in: versionIds } },
      select: { id: true, version: true, document: { select: { code: true } } },
    }),
    ctx.db.document.findMany({
      where: { id: { in: documentIds } },
      select: { id: true, code: true },
    }),
  ]);
  const recordLabel = (s: (typeof signatures)[number]) => {
    const v = versions.find((x) => x.id === s.entityId);
    if (v) return `${v.document.code} · v${v.version}`;
    return documents.find((d) => d.id === s.entityId)?.code ?? s.entityId;
  };
  const t = await getTranslations("documents");
  const format = await getFormatter();

  return (
    <>
      <PageHeader title={t("signaturesPage.title")} subtitle={t("signaturesPage.subtitle")} />
      <Card className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">{t("signaturesPage.date")}</th>
              <th className="px-4 py-3">{t("signaturesPage.meaning")}</th>
              <th className="px-4 py-3">{t("signaturesPage.record")}</th>
              <th className="px-4 py-3">{t("signaturesPage.comment")}</th>
              <th className="px-4 py-3">{t("detail.fingerprint")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {signatures.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {t("signaturesPage.empty")}
                </td>
              </tr>
            )}
            {signatures.map((s) => (
              <tr key={s.id}>
                <td className="px-4 py-3 whitespace-nowrap">
                  {format.dateTime(s.signedAt, { dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="px-4 py-3 font-medium">{t(`meanings.${s.meaning}`)}</td>
                <td className="px-4 py-3 font-mono">{recordLabel(s)}</td>
                <td className="px-4 py-3 text-slate-600">{s.comment ?? ""}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className="font-mono text-xs text-slate-500">
                    {s.signatureHash.slice(0, 12)}…
                  </span>
                  <Badge tone={verifySignatureHash(s) ? "success" : "danger"} className="ml-2">
                    {verifySignatureHash(s) ? t("detail.integrityOk") : t("detail.integrityFail")}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
