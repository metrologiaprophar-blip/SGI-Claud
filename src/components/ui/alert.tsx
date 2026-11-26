import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconKey } from "./icon";

type Tone = "info" | "success" | "warning" | "error";
const tones: Record<Tone, { box: string; icon: IconKey }> = {
  info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: "info" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: "check" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: "alert" },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: "alert" },
};

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-2.5 rounded-lg border p-3 text-sm", t.box, className)}
    >
      <Icon name={t.icon} className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
