import { getFormatter, getTranslations } from "next-intl/server";
import type { ElectronicSignature } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { verifySignatureHash } from "@/server/signatures";

/** Tabla de firmas electrónicas de un registro, con verificación de integridad de cada firma. */
export async function SignaturesTable({ signatures }: { signatures: ElectronicSignature[] }) {
  const t = await getTranslations();
  const format = await getFormatter();
  if (signatures.length === 0) return <p className="text-sm text-slate-500">{t("common.none")}</p>;
  return (
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
            <th className="py-2 pr-4">{t("documents.signaturesPage.comment")}</th>
            <th className="py-2">{t("documents.detail.fingerprint")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {signatures.map((s) => {
            const ok = verifySignatureHash(s);
            return (
              <tr key={s.id} className="align-top">
                <td className="py-2 pr-4 whitespace-nowrap">
                  {format.dateTime(s.signedAt, { dateStyle: "medium", timeStyle: "short" })}
                </td>
                <td className="py-2 pr-4">
                  {s.userFullName}
                  {s.userJobTitle && (
                    <span className="block text-xs text-slate-500">{s.userJobTitle}</span>
                  )}
                </td>
                <td className="py-2 pr-4 font-medium">{t(`documents.meanings.${s.meaning}`)}</td>
                <td className="py-2 pr-4 text-slate-600">{s.comment ?? ""}</td>
                <td className="py-2 whitespace-nowrap">
                  <span className="font-mono text-xs text-slate-500">
                    {s.signatureHash.slice(0, 12)}…
                  </span>
                  <Badge tone={ok ? "success" : "danger"} className="ml-2">
                    {ok ? t("documents.detail.integrityOk") : t("documents.detail.integrityFail")}
                  </Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
