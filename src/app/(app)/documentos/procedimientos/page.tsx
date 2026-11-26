import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  DocumentList,
  type DocumentListSearch,
} from "@/features/documents/components/document-list";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav.tools");
  return { title: t("sops") };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<DocumentListSearch>;
}) {
  return (
    <DocumentList
      toolKey="sops"
      types={["SOP", "INSTRUCTION"]}
      basePath="/documentos/procedimientos"
      search={await searchParams}
    />
  );
}
