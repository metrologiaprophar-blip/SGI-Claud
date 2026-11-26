import { getFormatter, getTranslations } from "next-intl/server";
import type { ActionStatus } from "@prisma/client";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  addActionAction,
  cancelActionAction,
  completeActionAction,
} from "@/features/quality/actions";

type ActionRow = {
  id: string;
  description: string;
  status: ActionStatus;
  dueDate: Date;
  evidence: string | null;
  completedAt: Date | null;
  responsible: { id: string; fullName: string };
};

const TONE: Record<ActionStatus, "warning" | "success" | "neutral"> = {
  PENDING: "warning",
  DONE: "success",
  CANCELLED: "neutral",
};

/** Plan de acción de una CAPA o un cambio: listado, ejecución con evidencia, anulación y alta. */
export async function ActionPlan({
  actions,
  parent,
  path,
  currentUserId,
  canExecute,
  canCancel,
  canAdd,
  users,
  today,
}: {
  actions: ActionRow[];
  parent: { capaId: string } | { changeControlId: string };
  path: string;
  currentUserId: string;
  canExecute: boolean;
  canCancel: boolean;
  canAdd: boolean;
  users: { id: string; fullName: string }[];
  today: string;
}) {
  const t = await getTranslations("quality");
  const format = await getFormatter();
  const now = new Date();
  const closed = actions.filter((a) => a.status !== "PENDING").length;
  const parentField: Record<string, string> =
    "capaId" in parent ? { capaId: parent.capaId } : { changeControlId: parent.changeControlId };

  return (
    <div className="space-y-4">
      {actions.length === 0 ? (
        <p className="text-sm text-slate-500">{t("actions.empty")}</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {t("actions.progress", { done: closed, total: actions.length })}
          </p>
          <div className="overflow-x-auto">
            <table
              className="min-w-full divide-y divide-slate-200 text-sm"
              data-testid="action-plan"
            >
              <thead className="text-left text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="py-2 pr-4">{t("actions.description")}</th>
                  <th className="py-2 pr-4">{t("actions.responsible")}</th>
                  <th className="py-2 pr-4">{t("actions.dueDate")}</th>
                  <th className="py-2 pr-4">{t("actions.status")}</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {actions.map((a) => {
                  const overdue = a.status === "PENDING" && a.dueDate < now;
                  return (
                    <tr key={a.id} className="align-top">
                      <td className="py-2 pr-4">
                        {a.description}
                        {a.evidence && (
                          <span className="mt-1 block text-xs text-slate-500">{a.evidence}</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">{a.responsible.fullName}</td>
                      <td
                        className={`py-2 pr-4 whitespace-nowrap ${overdue ? "font-semibold text-red-700" : ""}`}
                      >
                        {format.dateTime(a.dueDate, { dateStyle: "medium" })}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge tone={overdue ? "danger" : TONE[a.status]}>
                          {overdue ? t("common.overdue") : t(`actionStatus.${a.status}`)}
                        </Badge>
                      </td>
                      <td className="space-x-1 py-2 text-right whitespace-nowrap">
                        {a.status === "PENDING" &&
                          canExecute &&
                          a.responsible.id === currentUserId && (
                            <ModalButton
                              label={t("actions.complete")}
                              title={t("actions.complete")}
                              size="sm"
                              testId={`complete-action-${a.id}`}
                            >
                              <ActionForm
                                id={`complete-${a.id}`}
                                action={completeActionAction}
                                hidden={{ actionId: a.id, path }}
                                submitLabel={t("actions.complete")}
                              >
                                <p className="text-sm text-slate-700">{a.description}</p>
                                <Field id={`ev-${a.id}`} label={t("actions.completeEvidence")}>
                                  <Textarea
                                    id={`ev-${a.id}`}
                                    name="evidence"
                                    required
                                    minLength={5}
                                    maxLength={2000}
                                  />
                                </Field>
                              </ActionForm>
                            </ModalButton>
                          )}
                        {a.status === "PENDING" && canCancel && (
                          <ModalButton
                            label={t("actions.cancel")}
                            title={t("actions.cancel")}
                            size="sm"
                            variant="ghost"
                          >
                            <ActionForm
                              id={`cancel-${a.id}`}
                              action={cancelActionAction}
                              hidden={{ actionId: a.id, path }}
                              submitLabel={t("actions.cancel")}
                            >
                              <Field id={`cr-${a.id}`} label={t("common.reason")}>
                                <Textarea
                                  id={`cr-${a.id}`}
                                  name="reason"
                                  required
                                  minLength={5}
                                  maxLength={500}
                                />
                              </Field>
                            </ActionForm>
                          </ModalButton>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {canAdd && (
        <details className="rounded-lg border border-slate-200 p-4" open={actions.length === 0}>
          <summary className="text-brand-700 cursor-pointer text-sm font-semibold">
            {t("actions.add")}
          </summary>
          <ActionForm
            id="add-action"
            action={addActionAction}
            hidden={{ ...parentField, path }}
            submitLabel={t("actions.add")}
            className="mt-4 space-y-3"
          >
            <Field id="aa-description" label={t("actions.description")}>
              <Textarea
                id="aa-description"
                name="description"
                required
                minLength={5}
                maxLength={1000}
                className="min-h-14"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="aa-responsible" label={t("actions.responsible")}>
                <Select id="aa-responsible" name="responsibleId" required defaultValue="">
                  <option value="" disabled>
                    —
                  </option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="aa-due" label={t("actions.dueDate")}>
                <Input id="aa-due" name="dueDate" type="date" min={today} required />
              </Field>
            </div>
          </ActionForm>
        </details>
      )}
    </div>
  );
}
