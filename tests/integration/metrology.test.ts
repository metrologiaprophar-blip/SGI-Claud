import { beforeAll, describe, expect, it } from "vitest";
import {
  approveCalibration,
  getCalibration,
  openDeviationFromCalibration,
  recordCalibration,
} from "@/features/metrology/calibrations";
import {
  createEquipment,
  getMetrologyDashboard,
  retireEquipment,
  returnToService,
  takeOutOfService,
  updateEquipment,
} from "@/features/metrology/equipment";
import {
  approveQualification,
  getProficiency,
  recordMaintenance,
  recordProficiency,
  recordQualification,
  recordVerification,
} from "@/features/metrology/records";
import { createCapa } from "@/features/capa/service";
import { todayInZone } from "@/lib/dates";
import { verifySignatureHash } from "@/server/signatures";
import { createOrg, createUser, ctxFor, PASSWORD, prisma } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n% certificado\ntrailer<<>>\n%%EOF\n");
const today = () => todayInZone("America/Guayaquil");
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const org = await createOrg("MET");
  const process = await prisma.process.create({
    data: { organizationId: org.id, code: "MET", name: "Metrología" },
  });
  const tech = await createUser(org.id, "tecnico", "USUARIO", {
    permissions: ["METROLOGY_MANAGE"],
  });
  const approver = await createUser(org.id, "jefe", "USUARIO", {
    permissions: ["METROLOGY_APPROVE", "QA_APPROVE"],
  });
  const viewer = await createUser(org.id, "visor");
  const base = { processId: process.id, ownerId: tech.id, criticality: "HIGH" as const };
  const balance = await createEquipment(ctxFor(tech), {
    ...base,
    code: "bal-001",
    name: "Balanza analítica",
    equipmentType: "Balanza",
    isReferenceStandard: false,
    unit: "g",
    maxPermissibleError: 0.0005,
    calibrationIntervalMonths: 12,
    verificationIntervalDays: 30,
  });
  const standard = await createEquipment(ctxFor(tech), {
    ...base,
    code: "PAT-001",
    name: "Pesas patrón E2",
    equipmentType: "Pesas",
    isReferenceStandard: true,
    calibrationIntervalMonths: 24,
  });
  return { org, process, tech, approver, viewer, balance, standard };
}

const goodPoints = [
  { nominal: 100, reading: 100.0001, uncertainty: 0.0002 },
  { nominal: 200, reading: 199.9998, uncertainty: 0.0002 },
];

describe("metrología: equipos y calibraciones", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    s = await setup();
  });

  it("alta de equipos con permiso y código único", async () => {
    expect(s.balance.code).toBe("BAL-001");
    await expect(
      createEquipment(ctxFor(s.viewer), {
        code: "X-1",
        name: "X",
        equipmentType: "X",
        processId: s.process.id,
        ownerId: s.viewer.id,
        criticality: "LOW",
        isReferenceStandard: false,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      createEquipment(ctxFor(s.tech), {
        code: "BAL-001",
        name: "Otra",
        equipmentType: "Balanza",
        processId: s.process.id,
        ownerId: s.tech.id,
        criticality: "LOW",
        isReferenceStandard: false,
      }),
    ).rejects.toMatchObject({ code: "equipment_code_taken" });
  });

  it("calibración externa conforme → aprobada por otra persona → fechas y firma", async () => {
    await expect(
      recordCalibration(ctxFor(s.tech), {
        equipmentId: s.balance.id,
        kind: "EXTERNAL",
        provider: "Lab acreditado",
        certificateNumber: "C-1",
        calibratedAt: today(),
        points: goodPoints,
        referenceStandardIds: [],
        file: null,
      }),
    ).rejects.toMatchObject({ code: "file_required" });
    const cal = await recordCalibration(ctxFor(s.tech), {
      equipmentId: s.balance.id,
      kind: "EXTERNAL",
      provider: "Laboratorio acreditado SAE",
      accreditation: "SAE LC 18-007",
      certificateNumber: "CC-2026-1180",
      calibratedAt: daysAgo(2),
      points: goodPoints,
      referenceStandardIds: [],
      file: { name: "certificado.pdf", data: PDF },
    });
    expect(cal.code).toMatch(/^CAL-\d{4}-0001$/);
    expect(cal.result).toBe("CONFORM");

    await expect(
      approveCalibration(ctxFor(s.tech), cal.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "forbidden" });
    await prisma.user.update({
      where: { id: s.tech.id },
      data: { permissions: ["METROLOGY_MANAGE", "METROLOGY_APPROVE"] },
    });
    await expect(
      approveCalibration(ctxFor(s.tech), cal.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "segregation_of_duties" });
    await prisma.user.update({
      where: { id: s.tech.id },
      data: { permissions: ["METROLOGY_MANAGE"] },
    });

    await approveCalibration(ctxFor(s.approver), cal.id, {
      decision: "approve",
      password: PASSWORD,
    });
    const eq = await prisma.equipment.findUnique({ where: { id: s.balance.id } });
    expect(eq?.lastCalibrationAt?.toISOString()).toBe(cal.calibratedAt.toISOString());
    expect(eq?.nextCalibrationDue?.getUTCFullYear()).toBe(cal.calibratedAt.getUTCFullYear() + 1);
    const full = await getCalibration(ctxFor(s.approver).db, cal.id);
    expect(full?.signatures[0]?.contentHash).toBe(cal.fileSha256);
    expect(full?.signatures.every(verifySignatureHash)).toBe(true);
  });

  it("trazabilidad: la calibración interna exige un patrón vigente en la fecha", async () => {
    const internal = {
      equipmentId: s.balance.id,
      kind: "INTERNAL" as const,
      calibratedAt: today(),
      points: goodPoints,
      file: null,
    };
    await expect(
      recordCalibration(ctxFor(s.tech), { ...internal, referenceStandardIds: [] }),
    ).rejects.toMatchObject({ code: "reference_standard_required" });
    // El patrón aún no tiene calibración → no trazable
    await expect(
      recordCalibration(ctxFor(s.tech), { ...internal, referenceStandardIds: [s.standard.id] }),
    ).rejects.toMatchObject({ code: "reference_standard_not_traceable" });
    // Un equipo que no es patrón no sirve
    await expect(
      recordCalibration(ctxFor(s.tech), {
        ...internal,
        referenceStandardIds: [s.balance.id, s.standard.id],
      }),
    ).rejects.toMatchObject({
      code: "reference_standard_not_traceable",
    });
    await prisma.equipment.update({
      where: { id: s.standard.id },
      data: {
        lastCalibrationAt: new Date(Date.now() - 100 * 86_400_000),
        nextCalibrationDue: new Date(Date.now() + 300 * 86_400_000),
      },
    });
    const ok = await recordCalibration(ctxFor(s.tech), {
      ...internal,
      referenceStandardIds: [s.standard.id],
    });
    expect(ok.referenceStandardIds).toEqual([s.standard.id]);
  });

  it("no conforme: exige impacto, saca de servicio, abre desviación y bloquea la puesta en servicio hasta recalibrar", async () => {
    const bad = [{ nominal: 100, reading: 100.0004, uncertainty: 0.0002 }];
    const base = {
      equipmentId: s.balance.id,
      kind: "INTERNAL" as const,
      calibratedAt: today(),
      points: bad,
      referenceStandardIds: [s.standard.id],
      file: null,
    };
    await expect(
      recordCalibration(ctxFor(s.tech), { ...base, declaredResult: "CONFORM" }),
    ).rejects.toMatchObject({ code: "impact_assessment_required" });
    const cal = await recordCalibration(ctxFor(s.tech), {
      ...base,
      impactAssessment: "Revisar pesadas de los lotes L-101 a L-110 desde la última verificación.",
    });
    expect(cal.result).toBe("NON_CONFORM");
    expect((await prisma.equipment.findUnique({ where: { id: s.balance.id } }))?.status).toBe(
      "OUT_OF_SERVICE",
    );

    const dev = await openDeviationFromCalibration(ctxFor(s.tech), cal.id);
    expect(dev.category).toBe("EQUIPMENT");
    await expect(openDeviationFromCalibration(ctxFor(s.tech), cal.id)).rejects.toMatchObject({
      code: "deviation_already_linked",
    });

    // Aprobar el registro no conforme no devuelve el equipo a servicio
    await approveCalibration(ctxFor(s.approver), cal.id, {
      decision: "approve",
      password: PASSWORD,
    });
    expect((await prisma.equipment.findUnique({ where: { id: s.balance.id } }))?.status).toBe(
      "OUT_OF_SERVICE",
    );

    // Tras ajuste, una nueva calibración conforme aprobada lo devuelve a servicio
    const fixed = await recordCalibration(ctxFor(s.tech), {
      ...base,
      points: goodPoints,
      declaredResult: "ADJUSTED",
    });
    expect(fixed.result).toBe("ADJUSTED");
    await approveCalibration(ctxFor(s.approver), fixed.id, {
      decision: "approve",
      password: PASSWORD,
    });
    expect((await prisma.equipment.findUnique({ where: { id: s.balance.id } }))?.status).toBe(
      "IN_SERVICE",
    );
  });

  it("estados: fuera de servicio, puesta en servicio firmada (bloqueada si está vencido) y baja", async () => {
    const eq = await createEquipment(ctxFor(s.tech), {
      code: "TER-9",
      name: "Termómetro",
      equipmentType: "Termómetro",
      processId: s.process.id,
      ownerId: s.tech.id,
      criticality: "MEDIUM",
      isReferenceStandard: false,
      calibrationIntervalMonths: 12,
    });
    await takeOutOfService(ctxFor(s.tech), eq.id, "Golpe en el sensor");
    await expect(
      returnToService(ctxFor(s.approver), eq.id, "Revisado", PASSWORD),
    ).rejects.toMatchObject({ code: "calibration_overdue" });
    await prisma.equipment.update({
      where: { id: eq.id },
      data: { nextCalibrationDue: new Date(Date.now() + 86_400_000 * 100) },
    });
    await expect(
      returnToService(ctxFor(s.tech), eq.id, "Revisado", PASSWORD),
    ).rejects.toMatchObject({ code: "forbidden" });
    await returnToService(ctxFor(s.approver), eq.id, "Sensor revisado y verificado", PASSWORD);
    await updateEquipment(
      ctxFor(s.tech),
      eq.id,
      {
        name: "Termómetro digital",
        equipmentType: "Termómetro",
        processId: s.process.id,
        ownerId: s.tech.id,
        criticality: "MEDIUM",
        isReferenceStandard: false,
        calibrationIntervalMonths: 6,
      },
      "Cambio de intervalo por criticidad",
    );
    await retireEquipment(ctxFor(s.approver), eq.id, "Reemplazado por TER-10", PASSWORD);
    expect((await prisma.equipment.findUnique({ where: { id: eq.id } }))?.status).toBe("RETIRED");
  });

  it("verificación y mantenimiento actualizan vencimientos y estado", async () => {
    await recordVerification(
      ctxFor(s.tech),
      {
        equipmentId: s.balance.id,
        performedAt: today(),
        method: "Pesa de 100 g clase E2",
        readings: "100,0001 g",
        result: "CONFORM",
      },
      PASSWORD,
    );
    const eq = await prisma.equipment.findUnique({ where: { id: s.balance.id } });
    expect(eq?.nextVerificationDue).not.toBeNull();
    await recordMaintenance(ctxFor(s.tech), {
      equipmentId: s.balance.id,
      type: "CORRECTIVE",
      performedAt: today(),
      performedBy: "Servicio técnico externo",
      description: "Cambio de celda de carga",
      requiresRecalibration: true,
    });
    const after = await prisma.equipment.findUnique({ where: { id: s.balance.id } });
    expect(after?.status).toBe("OUT_OF_SERVICE");
    expect(after?.nextCalibrationDue!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("calificación IQ con informe aprobada por QA", async () => {
    const q = await recordQualification(ctxFor(s.tech), {
      equipmentId: s.standard.id,
      phase: "IQ",
      protocolRef: "PROT-IQ-014",
      executedAt: today(),
      result: "PASS",
      summary: "Instalación conforme a especificaciones del fabricante.",
      file: { name: "informe-iq.pdf", data: PDF },
    });
    expect(q.code).toMatch(/^QUAL-\d{4}-0001$/);
    await expect(
      approveQualification(ctxFor(s.tech), q.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const approved = await approveQualification(ctxFor(s.approver), q.id, {
      decision: "approve",
      password: PASSWORD,
    });
    expect(approved.status).toBe("APPROVED");
  });

  it("ensayo de aptitud: z calculado, insatisfactorio enlazado a CAPA", async () => {
    const ok = await recordProficiency(ctxFor(s.tech), {
      provider: "INEN",
      scheme: "Masa",
      round: "2026-1",
      measurand: "Masa 100 g",
      reportedValue: 100.3,
      assignedValue: 100,
      sigma: 0.2,
      reportDate: daysAgo(1),
    });
    expect(ok.zScore).toBe(1.5);
    expect(ok.outcome).toBe("SATISFACTORY");
    await expect(
      recordProficiency(ctxFor(s.tech), {
        provider: "X",
        scheme: "Y",
        round: "1",
        measurand: "pH",
        reportDate: today(),
      }),
    ).rejects.toMatchObject({ code: "z_score_required" });
    const bad = await recordProficiency(ctxFor(s.tech), {
      provider: "INEN",
      scheme: "pH",
      round: "2026-2",
      measurand: "pH 7",
      zScore: -3.4,
      reportDate: today(),
    });
    expect(bad.outcome).toBe("UNSATISFACTORY");
    await createCapa(ctxFor(s.approver), {
      title: "EA pH insatisfactorio",
      source: "PROFICIENCY",
      sourceReference: bad.code,
      problemStatement: "Resultado z = -3,4 en ensayo de aptitud de pH.",
      type: "CORRECTIVE",
      ownerId: s.tech.id,
      effectivenessCriteria: "|z| ≤ 2 en la siguiente ronda",
      targetDate: inDays(60),
    });
    expect((await getProficiency(ctxFor(s.tech).db, bad.id))?.capas).toHaveLength(1);
  });

  it("panel y aislamiento entre empresas", async () => {
    const dash = await getMetrologyDashboard(ctxFor(s.tech).db);
    expect(dash.outOfService.map((e) => e.code)).toContain("BAL-001");
    const other = await setup();
    expect((await getMetrologyDashboard(ctxFor(other.tech).db)).outOfService).toHaveLength(0);
    await expect(
      recordCalibration(ctxFor(other.tech), {
        equipmentId: s.balance.id,
        kind: "INTERNAL",
        calibratedAt: today(),
        points: goodPoints,
        referenceStandardIds: [other.standard.id],
        file: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await prisma.equipment.update({
      where: { id: other.standard.id },
      data: {
        lastCalibrationAt: new Date(Date.now() - 86_400_000),
        nextCalibrationDue: new Date(Date.now() + 86_400_000 * 300),
      },
    });
    // Un patrón de otra empresa no se puede usar
    await expect(
      recordCalibration(ctxFor(other.tech), {
        equipmentId: other.balance.id,
        kind: "INTERNAL",
        calibratedAt: today(),
        points: goodPoints,
        referenceStandardIds: [s.standard.id],
        file: null,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
