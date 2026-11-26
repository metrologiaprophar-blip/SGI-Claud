"use server";

import { redirect } from "next/navigation";
import type {
  CalibrationKind,
  CalibrationResult,
  MaintenanceType,
  QualificationPhase,
  QualificationResult,
  RiskLevel,
  VerificationResult,
} from "@prisma/client";
import { fail, type ActionResult } from "@/lib/result";
import { getServiceContext, runAction } from "@/server/action";
import { act, checked, field, optional } from "../quality/form";
import {
  approveCalibration,
  openDeviationFromCalibration,
  recordCalibration,
} from "./calibrations";
import {
  createEquipment,
  retireEquipment,
  returnToService,
  takeOutOfService,
  updateEquipment,
  type EquipmentInput,
} from "./equipment";
import {
  approveQualification,
  recordMaintenance,
  recordProficiency,
  recordQualification,
  recordVerification,
} from "./records";
import type { PointInput } from "./rules";

const num = (fd: FormData, name: string) => {
  const raw = field(fd, name).replace(",", ".");
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : Number.NaN;
};
const int = (fd: FormData, name: string) => {
  const n = num(fd, name);
  return n === null || Number.isNaN(n) ? n : Math.round(n);
};
const password = (fd: FormData) => String(fd.get("password") ?? "");

async function fileFrom(fd: FormData, name = "file") {
  const file = fd.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  return { name: file.name, data: Buffer.from(await file.arrayBuffer()) };
}

const readEquipment = (fd: FormData): Omit<EquipmentInput, "code"> => ({
  name: field(fd, "name"),
  equipmentType: field(fd, "equipmentType"),
  manufacturer: optional(fd, "manufacturer"),
  model: optional(fd, "model"),
  serialNumber: optional(fd, "serialNumber"),
  location: optional(fd, "location"),
  processId: field(fd, "processId"),
  ownerId: field(fd, "ownerId"),
  criticality: (field(fd, "criticality") || "MEDIUM") as RiskLevel,
  isReferenceStandard: checked(fd, "isReferenceStandard"),
  measurementRange: optional(fd, "measurementRange"),
  resolution: optional(fd, "resolution"),
  unit: optional(fd, "unit"),
  maxPermissibleError: num(fd, "maxPermissibleError"),
  calibrationIntervalMonths: int(fd, "calibrationIntervalMonths"),
  verificationIntervalDays: int(fd, "verificationIntervalDays"),
  maintenanceIntervalMonths: int(fd, "maintenanceIntervalMonths"),
});

const eqPath = (id: string) => `/metrologia/equipos/${id}`;

export async function createEquipmentAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    createEquipment(await getServiceContext(), { code: field(fd, "code"), ...readEquipment(fd) }),
  );
  if (!result.ok) return result;
  redirect(eqPath(result.data.id));
}

export async function updateEquipmentAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([eqPath(id), "/metrologia"], (ctx) =>
    updateEquipment(ctx, id, readEquipment(fd), field(fd, "reason")),
  );
}

export async function outOfServiceAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([eqPath(id), "/metrologia"], (ctx) => takeOutOfService(ctx, id, field(fd, "reason")));
}

export async function returnToServiceAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([eqPath(id), "/metrologia"], (ctx) =>
    returnToService(ctx, id, field(fd, "reason"), password(fd)),
  );
}

export async function retireEquipmentAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([eqPath(id), "/metrologia"], (ctx) =>
    retireEquipment(ctx, id, field(fd, "reason"), password(fd)),
  );
}

export async function recordCalibrationAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  let points: PointInput[];
  try {
    const parsed: unknown = JSON.parse(String(fd.get("points") ?? "[]"));
    points = (Array.isArray(parsed) ? parsed : []).map((p) => ({
      nominal: Number(p.nominal),
      reading: Number(p.reading),
      uncertainty: Number(p.uncertainty),
    }));
  } catch {
    return fail("calibration_points_invalid", "Invalid points");
  }
  const file = await fileFrom(fd);
  const result = await runAction(async () =>
    recordCalibration(await getServiceContext(), {
      equipmentId: field(fd, "equipmentId"),
      kind: field(fd, "kind") as CalibrationKind,
      provider: optional(fd, "provider"),
      accreditation: optional(fd, "accreditation"),
      certificateNumber: optional(fd, "certificateNumber"),
      calibratedAt: field(fd, "calibratedAt"),
      points,
      referenceStandardIds: fd.getAll("referenceStandardIds").map(String),
      declaredResult: (field(fd, "declaredResult") || null) as CalibrationResult | null,
      comments: optional(fd, "comments"),
      impactAssessment: optional(fd, "impactAssessment"),
      file,
    }),
  );
  if (!result.ok) return result;
  redirect(`/metrologia/calibraciones/${result.data.id}`);
}

export async function approveCalibrationAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([`/metrologia/calibraciones/${id}`, "/metrologia"], (ctx) =>
    approveCalibration(ctx, id, {
      decision: field(fd, "decision") === "reject" ? "reject" : "approve",
      comment: field(fd, "comment"),
      password: password(fd),
    }),
  );
}

export async function openDeviationAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    openDeviationFromCalibration(await getServiceContext(), field(fd, "id")),
  );
  if (!result.ok) return result;
  redirect(`/calidad/desviaciones/${result.data.id}`);
}

export async function recordVerificationAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const equipmentId = field(fd, "equipmentId");
  return act([eqPath(equipmentId), "/metrologia/verificaciones", "/metrologia"], (ctx) =>
    recordVerification(
      ctx,
      {
        equipmentId,
        performedAt: field(fd, "performedAt"),
        method: field(fd, "method"),
        readings: field(fd, "readings"),
        result: field(fd, "result") as VerificationResult,
        comments: optional(fd, "comments"),
      },
      password(fd),
    ),
  );
}

export async function recordMaintenanceAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const equipmentId = field(fd, "equipmentId");
  return act([eqPath(equipmentId), "/metrologia/mantenimiento", "/metrologia"], (ctx) =>
    recordMaintenance(ctx, {
      equipmentId,
      type: field(fd, "type") as MaintenanceType,
      performedAt: field(fd, "performedAt"),
      performedBy: field(fd, "performedBy"),
      description: field(fd, "description"),
      requiresRecalibration: checked(fd, "requiresRecalibration"),
    }),
  );
}

export async function recordQualificationAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const file = await fileFrom(fd);
  const result = await runAction(async () =>
    recordQualification(await getServiceContext(), {
      equipmentId: field(fd, "equipmentId"),
      phase: field(fd, "phase") as QualificationPhase,
      protocolRef: field(fd, "protocolRef"),
      executedAt: field(fd, "executedAt"),
      result: field(fd, "result") as QualificationResult,
      summary: field(fd, "summary"),
      file,
    }),
  );
  if (!result.ok) return result;
  redirect(`/metrologia/calificaciones/${result.data.id}`);
}

export async function approveQualificationAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const id = field(fd, "id");
  return act([`/metrologia/calificaciones/${id}`, "/metrologia"], (ctx) =>
    approveQualification(ctx, id, {
      decision: field(fd, "decision") === "reject" ? "reject" : "approve",
      comment: field(fd, "comment"),
      password: password(fd),
    }),
  );
}

export async function recordProficiencyAction(
  _p: ActionResult | null,
  fd: FormData,
): Promise<ActionResult> {
  const result = await runAction(async () =>
    recordProficiency(await getServiceContext(), {
      provider: field(fd, "provider"),
      scheme: field(fd, "scheme"),
      round: field(fd, "round"),
      measurand: field(fd, "measurand"),
      equipmentId: optional(fd, "equipmentId"),
      reportedValue: num(fd, "reportedValue"),
      assignedValue: num(fd, "assignedValue"),
      sigma: num(fd, "sigma"),
      zScore: num(fd, "zScore"),
      reportDate: field(fd, "reportDate"),
      comments: optional(fd, "comments"),
    }),
  );
  if (!result.ok) return result;
  redirect(`/metrologia/ensayos-aptitud/${result.data.id}`);
}
