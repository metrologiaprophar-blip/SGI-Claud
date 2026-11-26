import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getMetrologyDashboard } from "@/features/metrology/equipment";
import type { TenantDb } from "@/server/db/tenant-client";

/** Panel del área: indicadores y listas de lo que requiere atención. */
export async function MetrologyDashboard({ db }: { db: TenantDb }) {
  const d = await getMetrologyDashboard(db);
  const t = await getTranslations("metrology.dashboard");
  const format = await getFormatter();
  const date = (v: Date | null) => (v ? format.dateTime(v, { dateStyle: "medium" }) : "—");
  const kpis = [
    { key: "total", value: d.total, tone: "neutral" as const },
    {
      key: "overdue",
      value: d.overdue.length,
      tone: d.overdue.length ? ("danger" as const) : ("success" as const),
    },
    {
      key: "dueSoon",
      value: d.dueSoon.length,
      tone: d.dueSoon.length ? ("warning" as const) : ("success" as const),
    },
    {
      key: "outOfService",
      value: d.outOfService.length,
      tone: d.outOfService.length ? ("danger" as const) : ("success" as const),
    },
  ];
  const lists = [
    {
      key: "overdue",
      items: d.overdue.map((e) => ({
        href: `/metrologia/equipos/${e.id}`,
        code: e.code,
        title: e.name,
        extra: date(e.nextCalibrationDue),
      })),
    },
    {
      key: "dueSoon",
      items: d.dueSoon.map((e) => ({
        href: `/metrologia/equipos/${e.id}`,
        code: e.code,
        title: e.name,
        extra: date(e.nextCalibrationDue),
      })),
    },
    {
      key: "outOfService",
      items: d.outOfService.map((e) => ({
        href: `/metrologia/equipos/${e.id}`,
        code: e.code,
        title: e.name,
        extra: e.statusReason ?? "",
      })),
    },
    {
      key: "verificationsDue",
      items: d.verificationsDue.map((e) => ({
        href: `/metrologia/equipos/${e.id}`,
        code: e.code,
        title: e.name,
        extra: date(e.nextVerificationDue),
      })),
    },
    {
      key: "pendingCalibrations",
      items: d.pendingCalibrations.map((c) => ({
        href: `/metrologia/calibraciones/${c.id}`,
        code: c.code,
        title: `${c.equipment.code} · ${c.equipment.name}`,
        extra: "",
      })),
    },
    {
      key: "pendingQualifications",
      items: d.pendingQualifications.map((q) => ({
        href: `/metrologia/calificaciones/${q.id}`,
        code: q.code,
        title: `${q.equipment.code} · ${q.equipment.name}`,
        extra: "",
      })),
    },
  ].filter((l) => l.items.length > 0);

  return (
    <section className="mt-8 space-y-4" data-testid="metrology-dashboard">
      <h2 className="text-lg font-semibold text-slate-900">{t("title")}</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.key} className="flex items-center justify-between p-5">
            <span className="text-sm font-medium text-slate-600">{t(k.key)}</span>
            <Badge tone={k.tone} className="text-base">
              {k.value}
            </Badge>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {lists.map((l) => (
          <Card key={l.key} className="p-5" data-testid={`metrology-${l.key}`}>
            <h3 className="mb-2 font-semibold text-slate-900">
              {t(l.key)} <Badge tone="warning">{l.items.length}</Badge>
            </h3>
            <ul className="divide-y divide-slate-100">
              {l.items.map((i) => (
                <li key={i.href}>
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
                    {i.extra && <span className="shrink-0 text-xs text-slate-500">{i.extra}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  );
}
