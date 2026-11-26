"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const WARNING_SECONDS = 60;
const PING_EVERY_MS = 2 * 60_000;

/**
 * Cierre de sesión por inactividad (PRD §3.2). Avisa 60 s antes; con actividad del usuario
 * renueva la sesión en el servidor como máximo cada 2 minutos.
 */
export function IdleWatcher({ idleMinutes }: { idleMinutes: number }) {
  const t = useTranslations("nav");
  const [remaining, setRemaining] = useState<number | null>(null);
  const lastActivity = useRef(0);
  const lastPing = useRef(0);

  useEffect(() => {
    const now = Date.now();
    lastActivity.current = now;
    lastPing.current = now;
    const idleMs = idleMinutes * 60_000;

    // Navegación completa a propósito: descarta todo el estado del cliente al cerrar la sesión.
    const expire = () => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/salir?motivo=inactividad";
    };
    const ping = () => {
      lastPing.current = Date.now();
      fetch("/sesion/ping", { cache: "no-store" })
        .then((r) => {
          if (r.status === 401) expire();
        })
        .catch(() => undefined);
    };
    const onActivity = () => {
      lastActivity.current = Date.now();
      if (Date.now() - lastPing.current > PING_EVERY_MS) ping();
    };
    const events = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = window.setInterval(() => {
      const left = Math.ceil((idleMs - (Date.now() - lastActivity.current)) / 1000);
      if (left <= 0) {
        expire();
      } else {
        setRemaining(left <= WARNING_SECONDS ? left : null);
      }
    }, 1000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      window.clearInterval(timer);
    };
  }, [idleMinutes]);

  if (remaining === null) return null;
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed right-4 bottom-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-xl border border-amber-200 bg-white p-4 shadow-2xl"
    >
      <p className="text-sm font-medium text-slate-800">
        {t("idleWarning", { seconds: remaining })}
      </p>
      <Button
        className="mt-3 w-full"
        onClick={() => {
          lastActivity.current = Date.now();
          lastPing.current = 0;
          setRemaining(null);
          fetch("/sesion/ping", { cache: "no-store" }).catch(() => undefined);
        }}
      >
        {t("stayConnected")}
      </Button>
    </div>
  );
}
