"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/result";
import { useActionMessages } from "@/lib/use-action-messages";
import { submitWithoutReset } from "@/lib/use-form-submit";

type Action = (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;

/** Estado común de los formularios del flujo documental. */
export function useServiceForm(action: Action) {
  const [state, formAction, pending] = useActionState(action, null);
  const { formError, fieldError } = useActionMessages();
  return {
    state,
    pending,
    formProps: { action: formAction, onSubmit: submitWithoutReset(formAction), noValidate: true },
    error: state && !state.ok && state.error.code !== "validation" ? formError(state) : undefined,
    fieldError: (field: string) => fieldError(state, field),
    done: state?.ok === true,
  };
}
