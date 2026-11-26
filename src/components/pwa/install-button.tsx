"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Botón "Instalar aplicación": prompt nativo (Chrome/Edge/Android) o instrucciones (iOS y otros). */
export function InstallPwaButton({ className }: { className?: string }) {
  const t = useTranslations("pwa");
  const [hidden, setHidden] = useState(true);
  const [help, setHelp] = useState<"ios" | "generic" | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Sincroniza con el estado del navegador (instalada o no) tras montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHidden(isStandalone());
    const onInstalled = () => setInstalled(true);
    window.addEventListener("sgi:installed", onInstalled);
    return () => window.removeEventListener("sgi:installed", onInstalled);
  }, []);

  if (hidden) return null;

  async function install() {
    const prompt = window.__sgiInstallPrompt;
    if (prompt) {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      window.__sgiInstallPrompt = null;
      return;
    }
    setHelp(isIos() ? "ios" : "generic");
  }

  return (
    <>
      {installed ? (
        <Alert tone="success" className={className}>
          {t("installed")}
        </Alert>
      ) : (
        <button
          type="button"
          onClick={install}
          className={buttonClass("secondary", "sm", className)}
        >
          <Icon name="download" className="size-4" />
          {t("install")}
        </button>
      )}
      <Modal open={help !== null} onClose={() => setHelp(null)} title={t("installTitle")}>
        <p className="text-sm text-slate-700">
          {help === "ios" ? t("iosSteps") : t("genericSteps")}
        </p>
      </Modal>
    </>
  );
}
