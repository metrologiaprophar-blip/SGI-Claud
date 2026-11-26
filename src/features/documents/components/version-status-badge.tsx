import type { VersionStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";

const TONES: Record<VersionStatus, "neutral" | "brand" | "success" | "warning" | "danger"> = {
  DRAFT: "neutral",
  IN_REVIEW: "warning",
  PENDING_APPROVAL: "warning",
  APPROVED: "brand",
  EFFECTIVE: "success",
  SUPERSEDED: "neutral",
  OBSOLETE: "danger",
  CANCELLED: "neutral",
};

export function VersionStatusBadge({ status, label }: { status: VersionStatus; label: string }) {
  return (
    <Badge tone={TONES[status]} className="whitespace-nowrap">
      {label}
    </Badge>
  );
}
