"use client";

import { startTransition, type FormEvent } from "react";

/**
 * Envía un formulario a una acción de useActionState SIN el reinicio automático de React 19,
 * para que el usuario no pierda lo escrito cuando hay errores de validación.
 *
 * Usar SIEMPRE junto con `action={formAction}` en el <form>: antes de que cargue el JavaScript,
 * el navegador envía por POST a la Server Action (mejora progresiva) y nunca por GET, lo que
 * expondría datos como contraseñas en la URL.
 */
export function submitWithoutReset(dispatch: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
