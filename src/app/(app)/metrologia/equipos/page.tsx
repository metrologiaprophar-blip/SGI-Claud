import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActionForm } from "@/components/forms/action-form";
import { ModalButton } from "@/components/forms/modal-button";
import { EquipmentFormFields } from "@/components/metrology/equipment-form-fields";
import { EquipmentTable } from "@/components/metrology/equipment-table";
import { buttonClass } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { listAssignableUsers, listProcesses } from "@/features/documents/service";
import { createEquipmentAction } from "@/features/metrology/actions";
import { listEquipment } from "@/features/metrology/equipment";
import { getServiceContext } from "@/server/action";
import { hasPermission } from "@/server/permissions";

type Search = { q?: string; vence?: string; bajas?: string };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("equipment") };
}

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<Search> }) {
  const search = await searchParams;
  const ctx = await getServiceContext();
  const t = await getTranslations();
  const due = search.vence === "overdue" || search.vence === "soon" ? search.vence : undefined;
  const [rows, canManage, processes, users] = await Promise.all([
    listEquipment(ctx.db, { q: search.q, due, includeRetired: search.bajas === "1" }),
    hasPermission(ctx, "METROLOGY_MANAGE"),
    listProcesses(ctx.db),
    listAssignableUsers(ctx.db),
  ]);
  return (
    <>
      <PageHeader
        title={t("nav.tools.equipment")}
        subtitle={t("nav.toolDescriptions.equipment")}
        actions={
          canManage ? (
            <ModalButton
              label={t("metrology.equipment.new")}
              title={t("metrology.equipment.new")}
              testId="new-equipment"
            >
              <ActionForm
                id="new-equipment"
                action={createEquipmentAction}
                submitLabel={t("metrology.equipment.new")}
              >
                <EquipmentFormFields
                  processes={processes}
                  users={users}
                  defaultOwnerId={ctx.actor.id}
                />
              </ActionForm>
            </ModalButton>
          ) : null
        }
      />
      <Card className="mb-4 p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            name="q"
            defaultValue={search.q ?? ""}
            placeholder={t("metrology.equipment.search")}
            aria-label={t("metrology.equipment.search")}
            className="lg:col-span-2"
          />
          <Select
            name="vence"
            defaultValue={due ?? ""}
            aria-label={t("metrology.equipment.fields.nextCalibration")}
          >
            <option value="">{t("metrology.equipment.filterDue.all")}</option>
            <option value="overdue">{t("metrology.equipment.filterDue.overdue")}</option>
            <option value="soon">{t("metrology.equipment.filterDue.soon")}</option>
          </Select>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              <input
                type="checkbox"
                name="bajas"
                value="1"
                defaultChecked={search.bajas === "1"}
                className="accent-brand-700"
              />
              {t("metrology.equipment.showRetired")}
            </label>
            <button type="submit" className={buttonClass("primary", "md", "ml-auto")}>
              {t("common.filter")}
            </button>
            <Link href="/metrologia/equipos" className={buttonClass("outline", "md")}>
              {t("common.clear")}
            </Link>
          </div>
        </form>
      </Card>
      <p className="mb-2 text-sm text-slate-500">
        {t("metrology.equipment.count", { count: rows.length })}
      </p>
      <EquipmentTable rows={rows} />
    </>
  );
}
