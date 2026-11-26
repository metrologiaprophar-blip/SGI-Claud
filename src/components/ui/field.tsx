import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-xs placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-100";

type FieldProps = {
  id: string;
  label: ReactNode;
  error?: string;
  help?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Etiqueta + control + ayuda + error, con atributos ARIA enlazados. */
export function Field({ id, label, error, help, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="text-xs text-slate-500">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const describedBy = (id: string, error?: string, help?: ReactNode) =>
  error ? `${id}-error` : help ? `${id}-help` : undefined;

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "pr-8", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(inputClass, "min-h-20", className)} {...props} />;
}
