import { getFormatter, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { dueState } from "@/features/metrology/rules";

const TONE = { NONE: "neutral", OK: "success", DUE_SOON: "warning", OVERDUE: "danger" } as const;

/** Fecha de vencimiento con su estado (vigente / vence pronto / vencida). */
export async function DueBadge({ date }: { date: Date | null }) {
  const t = await getTranslations("metrology.due");
  const format = await getFormatter();
  const state = dueState(date);
  if (state === "NONE") return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="whitespace-nowrap">{format.dateTime(date!, { dateStyle: "medium" })}</span>
      {state !== "OK" && <Badge tone={TONE[state]}>{t(state)}</Badge>}
    </span>
  );
}
