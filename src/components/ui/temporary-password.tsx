"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "./alert";
import { Button } from "./button";
import { Icon } from "./icon";

/** Muestra una clave temporal una sola vez, con botón para copiarla. */
export function TemporaryPassword({ username, password }: { username: string; password: string }) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <Alert tone="warning">{t("admin.users.tempPasswordText", { username })}</Alert>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <code
          className="flex-1 font-mono text-lg tracking-wider text-slate-900 select-all"
          data-testid="temporary-password"
        >
          {password}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(password);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} className="size-4" />
          {copied ? t("common.copied") : t("common.copy")}
        </Button>
      </div>
    </div>
  );
}
