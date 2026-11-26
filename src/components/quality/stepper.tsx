import { cn } from "@/lib/cn";

/** Pasos de un flujo con el actual resaltado. `current` = índice del paso en curso (-1 si anulado). */
export function Stepper({
  steps,
  current,
  label,
}: {
  steps: string[];
  current: number;
  label: string;
}) {
  return (
    <ol
      className="grid gap-2 text-xs font-semibold"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      aria-label={label}
    >
      {steps.map((step, i) => {
        const state =
          current < 0 ? "todo" : i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li
            key={step}
            aria-current={state === "current" ? "step" : undefined}
            className={cn(
              "rounded-lg border px-2 py-2 text-center",
              state === "done" && "border-emerald-200 bg-emerald-50 text-emerald-800",
              state === "current" && "border-brand-300 bg-brand-50 text-brand-800",
              state === "todo" && "border-slate-200 text-slate-400",
            )}
          >
            <span className="mr-1 opacity-60">{String(i + 1).padStart(2, "0")}</span>
            {step}
          </li>
        );
      })}
    </ol>
  );
}

export function Section({
  title,
  children,
  className,
  actions,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-slate-200 bg-white p-5 shadow-xs", className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium whitespace-pre-line text-slate-800">{children}</dd>
    </div>
  );
}
