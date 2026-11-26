import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { EquipmentTable } from "@/components/metrology/equipment-table";
import { PageHeader } from "@/components/ui/card";
import { listEquipment } from "@/features/metrology/equipment";
import { getServiceContext } from "@/server/action";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("referenceStandards") };
}

/** Patrones de referencia: su calibración vigente es la base de la trazabilidad de las calibraciones internas. */
export default async function ReferenceStandardsPage() {
  const ctx = await getServiceContext();
  const t = await getTranslations("nav");
  const rows = await listEquipment(ctx.db, { referenceOnly: true });
  return (
    <>
      <PageHeader
        title={t("tools.referenceStandards")}
        subtitle={t("toolDescriptions.referenceStandards")}
      />
      <EquipmentTable rows={rows} showVerification={false} />
    </>
  );
}
