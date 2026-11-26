"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import {
  areaHref,
  CURRENT_PHASE,
  toolHref,
  visibleAreas,
  type NavArea,
  type Standard,
} from "@/config/navigation";
import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";
import { LanguageSwitcher } from "./language-switcher";
import { UserMenu } from "./user-menu";

const STANDARD_KEY = "sgi:standard";
type StandardFilter = Standard | "all";

type Props = {
  role: Role;
  fullName: string;
  username: string;
  organizationName: string;
  pendingResets: number;
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onOutside();
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [ref, onOutside]);
}

/** Barra superior por áreas con menús desplegables (PRD §8). Se genera desde config/navigation.ts. */
export function TopNav({ role, fullName, username, organizationName, pendingResets }: Props) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [alignRight, setAlignRight] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [standard, setStandard] = useState<StandardFilter>("all");
  const navRef = useRef<HTMLDivElement>(null);
  useClickOutside(navRef, () => setOpenArea(null));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STANDARD_KEY) as StandardFilter | null;
      // Preferencia guardada en el dispositivo; solo disponible en el cliente.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setStandard(saved);
    } catch {
      /* sin almacenamiento */
    }
  }, []);

  useEffect(() => {
    // Cierra los menús al navegar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenArea(null);
    setMobileOpen(false);
  }, [pathname]);

  const areas = visibleAreas(role);
  const toolsOf = (area: NavArea) =>
    area.tools.filter((tool) => standard === "all" || tool.standards.includes(standard));
  const isActive = (area: NavArea) =>
    pathname === areaHref(area) || pathname.startsWith(`${areaHref(area)}/`);

  const changeStandard = (value: StandardFilter) => {
    setStandard(value);
    try {
      localStorage.setItem(STANDARD_KEY, value);
    } catch {
      /* sin almacenamiento */
    }
  };

  const toolLink = (area: NavArea, tool: NavArea["tools"][number]) => {
    const available = tool.phase <= CURRENT_PHASE;
    return (
      <Link
        key={tool.key}
        href={toolHref(area, tool)}
        className="group hover:bg-brand-50 flex items-start justify-between gap-3 rounded-lg px-3 py-2 text-sm"
      >
        <span>
          <span className="group-hover:text-brand-800 block font-medium text-slate-800">
            {t(`tools.${tool.key}`)}
          </span>
        </span>
        {!available && (
          <span className="mt-0.5 shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500 uppercase">
            {t("phase", { phase: tool.phase })}
          </span>
        )}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      {/* Fila 1: marca y utilidades */}
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
          aria-label={mobileOpen ? t("closeMenu") : t("openMenu")}
        >
          <Icon name={mobileOpen ? "x" : "menu"} />
        </button>
        <Link href="/inicio" className="flex items-center gap-3">
          <Image
            src="/brand/prophar-mark.svg"
            alt=""
            width={36}
            height={31}
            className="h-8 w-auto"
          />
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-wide text-slate-900">
              SGI Cloud
            </span>
            <span className="text-brand-700 block text-[11px] font-semibold tracking-[0.2em]">
              PROPHAR
            </span>
          </span>
        </Link>
        <div className="mx-3 hidden h-8 w-px bg-slate-200 md:block" />
        <p className="hidden truncate text-sm text-slate-500 md:block">{organizationName}</p>

        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-2 text-xs font-medium text-slate-500 xl:flex">
            {t("standards.label")}
            <select
              value={standard}
              onChange={(e) => changeStandard(e.target.value as StandardFilter)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-medium text-slate-700"
            >
              <option value="all">{t("standards.all")}</option>
              <option value="GMP">{t("standards.GMP")}</option>
              <option value="BPADT">{t("standards.BPADT")}</option>
              <option value="ISO9001">{t("standards.ISO9001")}</option>
            </select>
          </label>
          {(role === "ADMIN_EMPRESA" || role === "SUPER_ADMIN") && (
            <Link
              href="/admin/solicitudes-clave"
              className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label={t("pendingResets", { count: pendingResets })}
              title={t("pendingResets", { count: pendingResets })}
            >
              <Icon name="bell" />
              {pendingResets > 0 && (
                <span
                  className="absolute top-1 right-1 grid min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
                  data-testid="pending-resets-badge"
                >
                  {pendingResets}
                </span>
              )}
            </Link>
          )}
          <LanguageSwitcher compact className="hidden sm:inline-flex" />
          <UserMenu fullName={fullName} username={username} role={role} />
        </div>
      </div>

      {/* Fila 2: áreas (escritorio) */}
      <nav
        ref={navRef}
        aria-label={t("mainMenu")}
        className="hidden border-t border-slate-100 lg:block"
      >
        <ul className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-x-0.5 px-4 sm:px-6">
          <li>
            <Link
              href="/inicio"
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-2.5 py-3 text-sm font-semibold",
                pathname === "/inicio"
                  ? "border-brand-700 text-brand-800"
                  : "border-transparent text-slate-600 hover:text-slate-900",
              )}
            >
              <Icon name="home" className="size-4" />
              {t("home")}
            </Link>
          </li>
          {areas.map((area) => {
            const tools = toolsOf(area);
            const open = openArea === area.key;
            return (
              <li key={area.key} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    // El panel mide 20rem: se alinea a la derecha si no cabe hacia la derecha.
                    const rect = e.currentTarget.getBoundingClientRect();
                    setAlignRight(rect.left + 320 > window.innerWidth - 16);
                    setOpenArea(open ? null : area.key);
                  }}
                  aria-expanded={open}
                  aria-haspopup="true"
                  className={cn(
                    "flex items-center gap-1.5 border-b-2 px-2.5 py-3 text-sm font-semibold whitespace-nowrap",
                    isActive(area)
                      ? "border-brand-700 text-brand-800"
                      : "border-transparent text-slate-600 hover:text-slate-900",
                  )}
                  data-testid={`area-${area.key}`}
                >
                  <Icon name={area.icon} className="hidden size-4 2xl:block" />
                  {t(`areas.${area.key}`)}
                  <Icon
                    name="chevronDown"
                    className={cn("size-3.5 transition-transform", open && "rotate-180")}
                  />
                </button>
                {open && (
                  <div
                    className={cn(
                      "absolute top-full z-50 mt-1 w-80 rounded-xl border border-slate-200 bg-white p-2 shadow-xl",
                      alignRight ? "right-0" : "left-0",
                    )}
                  >
                    <p className="px-3 pt-1 pb-2 text-xs leading-relaxed text-slate-500">
                      {t(`areaDescriptions.${area.key}`)}
                    </p>
                    <div className="space-y-0.5">{tools.map((tool) => toolLink(area, tool))}</div>
                    {!area.basePath && (
                      <Link
                        href={areaHref(area)}
                        className="text-brand-700 hover:bg-brand-50 mt-1 block rounded-lg px-3 py-2 text-xs font-semibold"
                      >
                        {t(`areas.${area.key}`)} →
                      </Link>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Menú móvil */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          aria-label={t("mainMenu")}
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 pb-6 lg:hidden"
        >
          <div className="flex items-center gap-2 py-3 sm:hidden">
            <LanguageSwitcher />
          </div>
          <Link
            href="/inicio"
            className="flex items-center gap-2 rounded-lg px-2 py-3 font-semibold text-slate-800"
          >
            <Icon name="home" className="size-4" />
            {t("home")}
          </Link>
          {areas.map((area) => (
            <details key={area.key} className="group border-t border-slate-100">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-2 py-3 font-semibold text-slate-800">
                <Icon name={area.icon} className="size-4" />
                {t(`areas.${area.key}`)}
                <Icon
                  name="chevronDown"
                  className="ml-auto size-4 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="pb-2 pl-4">{toolsOf(area).map((tool) => toolLink(area, tool))}</div>
            </details>
          ))}
        </nav>
      )}
    </header>
  );
}
