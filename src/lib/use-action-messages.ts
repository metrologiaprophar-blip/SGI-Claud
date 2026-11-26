"use client";

import { useTranslations } from "next-intl";
import type { ActionResult } from "./result";

/** Traduce los códigos de error de las acciones a mensajes del idioma activo. */
export function useActionMessages() {
  const t = useTranslations();
  const translate = (namespace: "errors" | "fieldErrors", code: string) => {
    const key = `${namespace}.${code}`;
    return t.has(key)
      ? t(key)
      : t(namespace === "errors" ? "errors.unexpected" : "fieldErrors.invalid");
  };
  return {
    formError: (result: ActionResult<unknown> | null) =>
      result && !result.ok ? translate("errors", result.error.code) : undefined,
    fieldError: (result: ActionResult<unknown> | null, field: string) => {
      const code = result && !result.ok ? result.error.fields?.[field] : undefined;
      return code ? translate("fieldErrors", code) : undefined;
    },
  };
}
