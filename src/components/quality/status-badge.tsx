import { Badge } from "@/components/ui/badge";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONES: Record<string, Tone> = {
  // Desviaciones
  REPORTED: "warning",
  UNDER_INVESTIGATION: "brand",
  PENDING_QA: "warning",
  // CAPA
  OPEN: "warning",
  IN_PROGRESS: "brand",
  EFFECTIVENESS_CHECK: "warning",
  // Cambios
  DRAFT: "neutral",
  IN_ASSESSMENT: "warning",
  APPROVED: "brand",
  IMPLEMENTED: "brand",
  REJECTED: "danger",
  // Comunes
  CLOSED: "success",
  CANCELLED: "neutral",
  // Clasificación
  MINOR: "neutral",
  MAJOR: "warning",
  CRITICAL: "danger",
};

export function StatusBadge({ value, label }: { value: string; label: string }) {
  return (
    <Badge tone={TONES[value] ?? "neutral"} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}
