"use client";

import { useEffect } from "react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
declare global {
  interface Window {
    __sgiInstallPrompt?: InstallPromptEvent | null;
  }
}

/** Registra el service worker y guarda el evento de instalación para el botón "Instalar". */
export function ServiceWorkerRegister() {
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__sgiInstallPrompt = e as InstallPromptEvent;
      window.dispatchEvent(new Event("sgi:installable"));
    };
    const onInstalled = () => {
      window.__sgiInstallPrompt = null;
      window.dispatchEvent(new Event("sgi:installed"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}
