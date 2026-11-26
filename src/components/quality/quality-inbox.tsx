import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getQualityInbox } from "@/features/quality/inbox";
import type { ServiceContext } from "@/server/context";

type Item = { key: string; href: string; code: string; title: string; extra?: string };

/** Bandeja "Mis pendientes de calidad": solo muestra los grupos con elementos. */
export async function QualityInbox({ ctx }: { ctx: ServiceContext }) {
  const inbox = await getQualityInbox(ctx);
  const t = await getTranslations("quality.inbox");
  const format = await getFormatter();
  const date = (d: Date | null | undefined) =>
    d ? format.dateTime(d, { dateStyle: "medium" }) : undefined;
  const dev = (d: { id: string; code: string; title: string; dueDate: Date | null }) => ({
    key: d.id,
    href: `/calidad/desviaciones/${d.id}`,
    code: d.code,
    title: d.title,
    extra: date(d.dueDate),
  });
  const capa = (c: { id: string; code: string; title: string; targetDate: Date }) => ({
    key: c.id,
    href: `/calidad/capa/${c.id}`,
    code: c.code,
    title: c.title,
    extra: date(c.targetDate),
  });
  const change = (c: { id: string; code: string; title: string; plannedDate: Date | null }) => ({
    key: c.id,
    href: `/calidad/control-cambios/${c.id}`,
    code: c.code,
    title: c.title,
    extra: date(c.plannedDate),
  });

  const groups: { key: string; items: Item[] }[] = [
    { key: "toTriage", items: inbox.toTriage.map(dev) },
    { key: "toInvestigate", items: inbox.toInvestigate.map(dev) },
    { key: "devToClose", items: inbox.devToClose.map(dev) },
    { key: "capaToApprove", items: inbox.capaToApprove.map(capa) },
    { key: "capaToVerify", items: inbox.capaToVerify.map(capa) },
    { key: "capaReady", items: inbox.capaReady.map(capa) },
    {
      key: "myActions",
      items: inbox.myActions.map((a) => {
        const parent = a.capa ? capa(a.capa) : change(a.changeControl!);
        return { ...parent, key: a.id, title: a.description, extra: date(a.dueDate) };
      }),
    },
    { key: "changesToAssess", items: inbox.changesToAssess.map(change) },
    { key: "changesToClose", items: inbox.changesToClose.map(change) },
    { key: "myDrafts", items: inbox.myDrafts.map(change) },
  ].filter((g) => g.items.length > 0);

  return (
    <section className="mt-8" data-testid="quality-inbox">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("title")}</h2>
      {groups.length === 0 ? (
        <Card className="p-6 text-sm text-slate-500">{t("empty")}</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.key} className="p-5" data-testid={`quality-inbox-${g.key}`}>
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-slate-900">
                {t(g.key)} <Badge tone="warning">{g.items.length}</Badge>
              </h3>
              <ul className="divide-y divide-slate-100">
                {g.items.map((i) => (
                  <li key={i.key}>
                    <Link
                      href={i.href}
                      className="hover:text-brand-800 flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="text-brand-700 font-mono text-sm font-semibold">
                          {i.code}
                        </span>
                        <span className="block truncate text-sm text-slate-800">{i.title}</span>
                      </span>
                      {i.extra && (
                        <span className="shrink-0 text-xs text-slate-500">{i.extra}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
