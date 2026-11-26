import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { IdleWatcher } from "@/components/layout/idle-watcher";
import { TopNav } from "@/components/layout/top-nav";
import { countPendingResetRequests } from "@/features/reset-requests/service";
import { isAdmin, requireSession } from "@/server/auth/guards";
import { getTenantDb } from "@/server/db/tenant";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const db = await getTenantDb();
  const [org, pendingResets] = await Promise.all([
    db.organization.findUnique({
      where: { id: session.user.organizationId },
      select: { name: true, sessionIdleMinutes: true },
    }),
    isAdmin(session.user.role)
      ? countPendingResetRequests(db, session.user.id)
      : Promise.resolve(0),
  ]);

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav
        role={session.user.role}
        fullName={session.user.fullName}
        username={session.user.username}
        organizationName={org?.name ?? session.user.organizationName}
        pendingResets={pendingResets}
      />
      <main className="mx-auto w-full max-w-screen-2xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
        <Breadcrumbs />
        {children}
      </main>
      <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        SGI Cloud · PROPHAR
      </footer>
      <IdleWatcher idleMinutes={org?.sessionIdleMinutes ?? 15} />
    </div>
  );
}
