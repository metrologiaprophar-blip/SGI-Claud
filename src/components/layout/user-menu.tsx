"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { Icon } from "@/components/ui/icon";
import { logoutAction } from "@/features/auth/actions";

export function UserMenu({
  fullName,
  username,
  role,
}: {
  fullName: string;
  username: string;
  role: Role;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t("nav.userMenu")}
        className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100"
        data-testid="user-menu"
      >
        <span className="bg-brand-700 grid size-8 place-items-center rounded-full text-xs font-bold text-white">
          {initials}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-medium text-slate-700 md:block">
          {fullName}
        </span>
        <Icon name="chevronDown" className="size-4 text-slate-500" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
        >
          <div className="border-b border-slate-100 px-3 pt-1 pb-3">
            <p className="truncate text-sm font-semibold text-slate-900">{fullName}</p>
            <p className="truncate text-xs text-slate-500">
              {username} · {t(`roles.${role}`)}
            </p>
          </div>
          <Link
            role="menuitem"
            href="/cambiar-clave"
            className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            <Icon name="key" className="size-4" />
            {t("nav.changePassword")}
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-700 hover:bg-red-50"
              data-testid="logout"
            >
              <Icon name="logout" className="size-4" />
              {t("nav.logout")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
