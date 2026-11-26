"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import type { Role, Status } from "@prisma/client";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { describedBy, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { TemporaryPassword } from "@/components/ui/temporary-password";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { resetUserPasswordAction, unlockUserAction, updateUserAction } from "../actions";

export type UserRowView = {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  jobTitle: string | null;
  role: Role;
  status: Status;
  mustChangePassword: boolean;
  permissions: Permission[];
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

function EditUserForm({
  user,
  isSelf,
  actorRole,
  onDone,
}: {
  user: UserRowView;
  isSelf: boolean;
  actorRole: Role;
  onDone: () => void;
}) {
  const t = useTranslations();
  const { formError, fieldError } = useActionMessages();
  const [state, formAction, pending] = useActionState(updateUserAction, null);
  if (state?.ok) {
    return (
      <div className="space-y-4">
        <Alert tone="success">{t("common.saved")}</Alert>
        <div className="flex justify-end">
          <Button onClick={onDone}>{t("common.close")}</Button>
        </div>
      </div>
    );
  }
  const err =
    state && !state.ok && state.error.code !== "validation" ? formError(state) : undefined;
  const fe = (f: string) => fieldError(state, f);
  const lockRole = isSelf || user.role === "SUPER_ADMIN";
  return (
    <form
      action={formAction}
      onSubmit={submitWithoutReset(formAction)}
      className="space-y-4"
      noValidate
    >
      <input type="hidden" name="id" value={user.id} />
      {err && <Alert tone="error">{err}</Alert>}
      <p className="text-sm text-slate-500">
        {t("admin.users.username")}:{" "}
        <span className="font-mono font-semibold text-slate-800">{user.username}</span>
      </p>
      <Field id="eu-fullName" label={t("admin.users.fullName")} error={fe("fullName")}>
        <Input
          id="eu-fullName"
          name="fullName"
          defaultValue={user.fullName}
          required
          aria-invalid={!!fe("fullName")}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="eu-email" label={t("admin.users.email")} error={fe("email")}>
          <Input
            id="eu-email"
            name="email"
            type="email"
            defaultValue={user.email ?? ""}
            aria-invalid={!!fe("email")}
          />
        </Field>
        <Field id="eu-jobTitle" label={t("admin.users.jobTitle")}>
          <Input id="eu-jobTitle" name="jobTitle" defaultValue={user.jobTitle ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="eu-role" label={t("admin.users.role")}>
          {lockRole && <input type="hidden" name="role" value={user.role} />}
          <Select
            id="eu-role"
            name={lockRole ? undefined : "role"}
            defaultValue={user.role}
            disabled={lockRole}
          >
            {user.role === "SUPER_ADMIN" && (
              <option value="SUPER_ADMIN">{t("roles.SUPER_ADMIN")}</option>
            )}
            <option value="USUARIO">{t("roles.USUARIO")}</option>
            <option value="ADMIN_EMPRESA">{t("roles.ADMIN_EMPRESA")}</option>
          </Select>
        </Field>
        <Field id="eu-status" label={t("admin.users.status")}>
          {isSelf && <input type="hidden" name="status" value={user.status} />}
          <Select
            id="eu-status"
            name={isSelf ? undefined : "status"}
            defaultValue={user.status}
            disabled={isSelf}
          >
            <option value="ACTIVE">{t("status.ACTIVE")}</option>
            <option value="SUSPENDED">{t("status.SUSPENDED")}</option>
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-slate-700">
          {t("admin.users.permissions")}
        </legend>
        <div className="space-y-1.5">
          {PERMISSIONS.map((perm) => (
            <label key={perm} className="flex items-start gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="permissions"
                value={perm}
                defaultChecked={user.permissions.includes(perm)}
                className="accent-brand-700 mt-0.5"
              />
              {t(`admin.users.perm.${perm}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <Field
        id="eu-reason"
        label={t("common.reason")}
        error={fe("reason")}
        help={t("common.reasonHelp")}
      >
        <Textarea
          id="eu-reason"
          name="reason"
          maxLength={500}
          aria-describedby={describedBy("eu-reason", fe("reason"), true)}
        />
      </Field>
      {actorRole !== "SUPER_ADMIN" && user.role === "SUPER_ADMIN" ? null : (
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onDone}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? t("common.saving") : t("common.save")}
          </Button>
        </div>
      )}
    </form>
  );
}

export function UsersTable({
  users,
  currentUserId,
  actorRole,
}: {
  users: UserRowView[];
  currentUserId: string;
  actorRole: Role;
}) {
  const t = useTranslations();
  const format = useFormatter();
  const { formError } = useActionMessages();
  const [editing, setEditing] = useState<UserRowView | null>(null);
  const [temp, setTemp] = useState<{ username: string; temporaryPassword: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const resetPassword = (u: UserRowView) => {
    if (!window.confirm(t("admin.users.resetConfirm", { username: u.username }))) return;
    startTransition(async () => {
      const r = await resetUserPasswordAction(u.id);
      if (r.ok) setTemp(r.data);
      else setError(formError(r) ?? null);
    });
  };
  const unlock = (u: UserRowView) =>
    startTransition(async () => {
      const r = await unlockUserAction(u.id);
      if (!r.ok) setError(formError(r) ?? null);
    });

  if (users.length === 0)
    return <Card className="p-8 text-center text-slate-500">{t("admin.users.empty")}</Card>;

  return (
    <>
      {error && (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      )}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-3">{t("admin.users.fullName")}</th>
                <th className="px-4 py-3">{t("admin.users.username")}</th>
                <th className="px-4 py-3">{t("admin.users.role")}</th>
                <th className="px-4 py-3">{t("admin.users.status")}</th>
                <th className="px-4 py-3">{t("admin.users.lastLogin")}</th>
                <th className="px-4 py-3 text-right">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                const protectedUser = u.role === "SUPER_ADMIN" && actorRole !== "SUPER_ADMIN";
                return (
                  <tr key={u.id} className="align-top" data-testid={`user-row-${u.username}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">
                        {u.fullName} {isSelf && <Badge tone="brand">{t("admin.users.you")}</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {[u.jobTitle, u.email].filter(Boolean).join(" · ") || t("common.none")}
                      </p>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{u.username}</td>
                    <td className="px-4 py-3">
                      {t(`roles.${u.role}`)}
                      {u.permissions.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {u.permissions.map((p) => (
                            <Badge key={p} tone="brand">
                              {p}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="space-x-1 px-4 py-3 whitespace-nowrap">
                      <Badge tone={u.status === "ACTIVE" ? "success" : "danger"}>
                        {t(`status.${u.status}`)}
                      </Badge>
                      {u.lockedUntil && <Badge tone="danger">{t("status.LOCKED")}</Badge>}
                      {u.mustChangePassword && (
                        <Badge tone="warning">{t("status.MUST_CHANGE")}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600">
                      {u.lastLoginAt
                        ? format.dateTime(new Date(u.lastLoginAt), {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : t("common.never")}
                    </td>
                    <td className="px-4 py-3">
                      {!protectedUser && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(u)}>
                            {t("common.edit")}
                          </Button>
                          {!isSelf && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resetPassword(u)}
                              disabled={pending}
                            >
                              {t("admin.users.resetPassword")}
                            </Button>
                          )}
                          {u.lockedUntil && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => unlock(u)}
                              disabled={pending}
                            >
                              {t("admin.users.unlock")}
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("admin.users.editTitle")}>
        {editing && (
          <EditUserForm
            key={editing.id}
            user={editing}
            isSelf={editing.id === currentUserId}
            actorRole={actorRole}
            onDone={() => setEditing(null)}
          />
        )}
      </Modal>
      <Modal open={!!temp} onClose={() => setTemp(null)} title={t("admin.users.tempPasswordTitle")}>
        {temp && (
          <div className="space-y-4">
            <TemporaryPassword username={temp.username} password={temp.temporaryPassword} />
            <div className="flex justify-end">
              <Button onClick={() => setTemp(null)}>{t("common.close")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
