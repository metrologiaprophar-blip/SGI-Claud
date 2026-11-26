"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/lib/result";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useServiceForm } from "@/lib/use-service-form";
import { SignaturePassword } from "./signature-password";

type Decision = { value: string; label: string; variant?: "primary" | "outline" | "danger" };

/**
 * Formulario genérico para una Server Action `(prev, formData) => ActionResult`.
 * - `hidden`: campos ocultos (ids).
 * - `signature`: añade el bloque de firma electrónica con ese significado.
 * - `decisions`: varios botones de envío con name="decision" (p. ej. aprobar / rechazar).
 * Los campos se pasan como children (pueden venir de un Server Component).
 */
export function ActionForm({
  action,
  hidden = {},
  children,
  submitLabel,
  decisions,
  signature,
  successMessage,
  onSuccess,
  id,
  className = "space-y-4",
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  hidden?: Record<string, string>;
  children?: ReactNode;
  submitLabel?: string;
  decisions?: Decision[];
  signature?: string;
  successMessage?: string;
  onSuccess?: () => void;
  id: string;
  className?: string;
}) {
  const t = useTranslations();
  const f = useServiceForm(action);
  const fieldErrors = f.state && !f.state.ok ? Object.keys(f.state.error.fields ?? {}) : [];
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!f.done) return;
    onSuccess?.();
    // Avisa a un modal contenedor (ModalButton) para que se cierre.
    ref.current?.dispatchEvent(new CustomEvent("action-form:success", { bubbles: true }));
  }, [f.state, f.done, onSuccess]);

  return (
    <form
      ref={ref}
      action={f.formProps.action}
      onSubmit={f.formProps.onSubmit}
      className={className}
      data-testid={`form-${id}`}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {f.error && <Alert tone="error">{f.error}</Alert>}
      {fieldErrors.length > 0 && <Alert tone="error">{t("errors.validation")}</Alert>}
      {f.done && successMessage && <Alert tone="success">{successMessage}</Alert>}
      {children}
      {signature && (
        <SignaturePassword
          id={`${id}-password`}
          meaning={signature}
          error={f.fieldError("password")}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {decisions ? (
          decisions.map((d) => (
            <Button
              key={d.value}
              type="submit"
              name="decision"
              value={d.value}
              variant={d.variant ?? "primary"}
              disabled={f.pending}
            >
              {d.label}
            </Button>
          ))
        ) : (
          <Button type="submit" disabled={f.pending}>
            {f.pending ? t("common.saving") : (submitLabel ?? t("common.save"))}
          </Button>
        )}
      </div>
    </form>
  );
}
