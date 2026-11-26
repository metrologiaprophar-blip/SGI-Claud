"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { ResetStatus, Role } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { TemporaryPassword } from "@/components/ui/temporary-password";
import { useActionMessages } from "@/lib/use-action-messages";
import { approveResetRequestAction, rejectResetRequestAction } from "../actions";

type RequestView = {
  id: string;
  status: ResetStatus;
  note: string | null;
  resolutionNote: string | null;
  createdAt: string;
  expiresAt: string;
  resolvedAt: string | null;
  user: { id: string; username: string; fullName: string; role: Role };
};

const tone: Record<ResetStatus, "warning" | "success" | "danger" | "neutral"> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export function ResetRequestsList({
  requests,
  currentUserId,
  actorRole,
}: {
  requests: RequestView[];
  currentUserId: string;
  actorRole: Role;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const { formError } = useActionMessages();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [approved, setApproved] = useState<{ username: string; temporaryPassword: string } | null>(
    null,
  );
  const [rejecting, setRejecting] = useState<RequestView | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const pendingRows = requests.filter((r) => r.status === "PENDING");
  const history = requests.filter((r) => r.status !== "PENDING");
  const dt = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  const approve = (r: RequestView) => {
    if (!window.confirm(t("admin.resets.approveConfirm", { name: r.user.fullName }))) return;
    setError(null);
    startTransition(async () => {
      const res = await approveResetRequestAction(r.id);
      if (res.ok)
        setApproved({ username: res.data.username, temporaryPassword: res.data.temporaryPassword });
      else setError(formError(res) ?? null);
    });
  };
  const reject = () => {
    if (!rejecting) return;
    const target = rejecting;
    startTransition(async () => {
      const res = await rejectResetRequestAction(target.id, rejectNote);
      if (res.ok) {
        setRejecting(null);
        setRejectNote("");
      } else setError(formError(res) ?? null);
    });
  };

  return (
    <div className="space-y-8">
      {error && <Alert tone="error">{error}</Alert>}

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">
          {t("admin.resets.pending")} <span className="text-slate-400">({pendingRows.length})</span>
        </h2>
        {pendingRows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">
            {t("admin.resets.emptyPending")}
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {pendingRows.map((r) => {
              const own = r.user.id === currentUserId;
              const blocked = own || (r.user.role === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN");
              return (
                <Card key={r.id} className="p-5" data-testid={`reset-request-${r.user.username}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{r.user.fullName}</p>
                      <p className="font-mono text-sm text-slate-600">
                        {r.user.username} · {t(`roles.${r.user.role}`)}
                      </p>
                    </div>
                    <Badge tone="warning">{t("status.PENDING")}</Badge>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-slate-500">{t("admin.resets.requested")}</dt>
                      <dd>{dt(r.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">{t("admin.resets.expires")}</dt>
                      <dd>{dt(r.expiresAt)}</dd>
                    </div>
                  </dl>
                  {r.note && (
                    <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                      <span className="block text-xs font-medium text-slate-500">
                        {t("admin.resets.note")}
                      </span>
                      {r.note}
                    </p>
                  )}
                  {own ? (
                    <p className="mt-4 text-sm text-amber-700">{t("admin.resets.own")}</p>
                  ) : (
                    !blocked && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Button onClick={() => approve(r)} disabled={pending}>
                          {t("admin.resets.approve")}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setRejecting(r)}
                          disabled={pending}
                        >
                          {t("admin.resets.reject")}
                        </Button>
                      </div>
                    )
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{t("admin.resets.history")}</h2>
        {history.length === 0 ? (
          <Card className="p-6 text-center text-sm text-slate-500">
            {t("admin.resets.emptyHistory")}
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-3">{t("admin.resets.user")}</th>
                  <th className="px-4 py-3">{t("admin.resets.requested")}</th>
                  <th className="px-4 py-3">{t("common.status")}</th>
                  <th className="px-4 py-3">{t("admin.resets.resolution")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-3">
                      {r.user.fullName}{" "}
                      <span className="font-mono text-xs text-slate-500">({r.user.username})</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{dt(r.createdAt)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={tone[r.status]}>{t(`status.${r.status}`)}</Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {r.resolvedAt ? dt(r.resolvedAt) : t("common.none")}
                      {r.resolutionNote && (
                        <span className="block text-xs">{r.resolutionNote}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      <Modal
        open={!!approved}
        onClose={() => setApproved(null)}
        title={t("admin.resets.approvedTitle")}
      >
        {approved && (
          <div className="space-y-4">
            <TemporaryPassword username={approved.username} password={approved.temporaryPassword} />
            <div className="flex justify-end">
              <Button onClick={() => setApproved(null)}>{t("common.close")}</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!rejecting} onClose={() => setRejecting(null)} title={t("admin.resets.reject")}>
        <div className="space-y-4">
          <Field id="reject-note" label={t("admin.resets.rejectReason")}>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              maxLength={500}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRejecting(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={reject}
              disabled={pending || rejectNote.trim().length < 3}
            >
              {t("admin.resets.reject")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
