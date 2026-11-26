import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Icon, type IconKey } from "@/components/ui/icon";
import { areaHref, CURRENT_PHASE, toolHref, visibleAreas } from "@/config/navigation";
import { countPendingResetRequests } from "@/features/reset-requests/service";
import { countInbox } from "@/features/documents/service";
import { countQualityInbox } from "@/features/quality/inbox";
import { getServiceContext } from "@/server/action";
import { isAdmin, requireSession } from "@/server/auth/guards";
import { getTenantDb } from "@/server/db/tenant";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("home") };
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ clave?: string }>;
}) {
  const { clave } = await searchParams;
  const session = await requireSession();
  const db = await getTenantDb();
  const t = await getTranslations();
  const format = await getFormatter();
  const admin = isAdmin(session.user.role);

  const ctx = await getServiceContext();
  const [activeUsers, pending, me, docInbox, qualityInbox] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE" } }),
    admin ? countPendingResetRequests(db, session.user.id) : Promise.resolve(0),
    db.auditLog.findMany({
      where: { actorId: session.user.id, action: "auth.login.success" },
      orderBy: { createdAt: "desc" },
      take: 2,
      select: { createdAt: true },
    }),
    countInbox(db, session.user.id),
    countQualityInbox(ctx),
  ]);
  const previousLogin = me[1]?.createdAt;

  const stats: { label: string; value: string; icon: IconKey; href?: string }[] = [
    {
      label: t("home.docInbox"),
      value: String(docInbox),
      icon: "docs",
      href: "/documentos/bandeja-revision",
    },
    {
      label: t("home.qualityInbox"),
      value: String(qualityInbox),
      icon: "quality",
      href: "/calidad",
    },
    { label: t("home.yourRole"), value: t(`roles.${session.user.role}`), icon: "user" },
    {
      label: t("home.lastLogin"),
      value: previousLogin
        ? format.dateTime(previousLogin, { dateStyle: "medium", timeStyle: "short" })
        : t("common.never"),
      icon: "clock",
    },
    ...(admin
      ? [
          {
            label: t("home.activeUsers"),
            value: String(activeUsers),
            icon: "users" as const,
            href: "/admin/usuarios",
          },
          {
            label: t("home.pendingResets"),
            value: String(pending),
            icon: "key" as const,
            href: "/admin/solicitudes-clave",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
          {t("home.greeting", { name: session.user.fullName.split(" ")[0] ?? "" })}
        </h1>
        <p className="mt-1 text-slate-600">
          {t("home.subtitle", { company: session.user.organizationName })}
        </p>
      </div>

      {clave === "actualizada" && <Alert tone="success">{t("home.passwordUpdated")}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => {
          const body = (
            <Card className="flex h-full items-center gap-4 p-5 transition-shadow hover:shadow-md">
              <span className="bg-brand-50 text-brand-700 grid size-11 shrink-0 place-items-center rounded-xl">
                <Icon name={s.icon} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">
                  {s.label}
                </p>
                <p className="truncate text-lg font-bold text-slate-900">{s.value}</p>
              </div>
            </Card>
          );
          return s.href ? (
            <Link key={s.label} href={s.href}>
              {body}
            </Link>
          ) : (
            <div key={s.label}>{body}</div>
          );
        })}
      </div>

      <Alert tone="info">{t("home.phaseNotice")}</Alert>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("home.areasTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleAreas(session.user.role).map((area) => {
            const available = area.tools.filter((tool) => tool.phase <= CURRENT_PHASE).length;
            const href = area.basePath ? toolHref(area, area.tools[0]!) : areaHref(area);
            return (
              <Link key={area.key} href={href} className="group">
                <Card className="group-hover:border-brand-300 h-full p-5 transition-all group-hover:shadow-md">
                  <div className="flex items-start gap-4">
                    <span className="bg-brand-700 grid size-11 shrink-0 place-items-center rounded-xl text-white">
                      <Icon name={area.icon} />
                    </span>
                    <div>
                      <h3 className="group-hover:text-brand-800 font-semibold text-slate-900">
                        {t(`nav.areas.${area.key}`)}
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        {t(`nav.areaDescriptions.${area.key}`)}
                      </p>
                      <p
                        className={`mt-3 text-xs font-semibold ${available ? "text-emerald-700" : "text-slate-400"}`}
                      >
                        {t("home.toolsAvailable", { count: available })}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
