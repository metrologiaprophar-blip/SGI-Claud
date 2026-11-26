import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";

export type ListSearch = { q?: string; estado?: string; ver?: string };

/** Filtros comunes de las listas de calidad: texto, estado y "abiertos / míos / todos". */
export async function ListFilters({
  basePath,
  search,
  statuses,
}: {
  basePath: string;
  search: ListSearch;
  statuses: { value: string; label: string }[];
}) {
  const t = await getTranslations("quality.common");
  const tc = await getTranslations("common");
  return (
    <Card className="mb-4 p-4">
      <form method="get" action={basePath} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          name="q"
          defaultValue={search.q ?? ""}
          placeholder={t("search")}
          aria-label={t("search")}
          className="lg:col-span-2"
        />
        <Select name="estado" defaultValue={search.estado ?? ""} aria-label={t("status")}>
          <option value="">{t("status")}</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="ver" defaultValue={search.ver ?? "abiertos"} aria-label={t("open")}>
          <option value="abiertos">{t("open")}</option>
          <option value="mios">{t("mine")}</option>
          <option value="todos">{t("all")}</option>
        </Select>
        <div className="flex gap-2">
          <button type="submit" className={buttonClass("primary", "md", "flex-1")}>
            {tc("filter")}
          </button>
          <Link href={basePath} className={buttonClass("outline", "md")}>
            {tc("clear")}
          </Link>
        </div>
      </form>
    </Card>
  );
}
