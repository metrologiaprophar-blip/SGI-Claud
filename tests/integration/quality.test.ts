import { beforeAll, describe, expect, it } from "vitest";
import {
  closeDeviation,
  dismissDeviation,
  getDeviation,
  reportDeviation,
  saveInvestigation,
  submitInvestigation,
  triageDeviation,
} from "@/features/deviations/service";
import {
  addCapaAction,
  approveCapaPlan,
  cancelCapa,
  createCapa,
  getCapa,
  requestEffectivenessCheck,
  verifyEffectiveness,
} from "@/features/capa/service";
import {
  addChangeAction,
  cancelChange,
  closeChange,
  createChange,
  decideChange,
  getChange,
  markImplemented,
  saveAssessment,
  submitChange,
} from "@/features/change-control/service";
import { cancelAction, completeAction } from "@/features/quality/actions-service";
import { getQualityInbox } from "@/features/quality/inbox";
import { todayInZone } from "@/lib/dates";
import { verifySignatureHash } from "@/server/signatures";
import { createOrg, createUser, ctxFor, PASSWORD, prisma } from "./helpers";

const today = () => todayInZone("America/Guayaquil");
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function setup() {
  const org = await createOrg("QA");
  const process = await prisma.process.create({
    data: { organizationId: org.id, code: "ALM", name: "Almacén" },
  });
  const operator = await createUser(org.id, "operario");
  const investigator = await createUser(org.id, "investigador");
  const qa = await createUser(org.id, "qa", "USUARIO", { permissions: ["QA_APPROVE"] });
  const qa2 = await createUser(org.id, "qa2", "USUARIO", { permissions: ["QA_APPROVE"] });
  return { org, process, operator, investigator, qa, qa2 };
}

const report = (
  s: Awaited<ReturnType<typeof setup>>,
  title = "Excursión de temperatura en cámara fría",
) =>
  reportDeviation(ctxFor(s.operator), {
    title,
    description: "El registrador marcó 9,4 °C durante 3 horas en la cámara 2.",
    category: "STORAGE_TRANSPORT",
    processId: s.process.id,
    detectedAt: today(),
    batches: "L2611-045",
    immediateAction: "Producto en cuarentena y traslado a cámara 1.",
  });

describe("desviaciones", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    s = await setup();
  });

  it("ciclo: reporte → clasificación → investigación → CAPA → cierre firmado", async () => {
    const dev = await report(s);
    expect(dev.code).toMatch(/^DEV-\d{4}-0001$/);
    expect((await report(s, "Segunda desviación")).code).toMatch(/-0002$/);

    await expect(
      triageDeviation(ctxFor(s.operator), dev.id, {
        classification: "MAJOR",
        investigatorId: s.investigator.id,
        capaRequired: true,
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const triaged = await triageDeviation(ctxFor(s.qa), dev.id, {
      classification: "MAJOR",
      investigatorId: s.investigator.id,
      capaRequired: true,
    });
    expect(triaged.status).toBe("UNDER_INVESTIGATION");
    expect(triaged.dueDate).not.toBeNull();

    await expect(
      submitInvestigation(ctxFor(s.investigator), dev.id, PASSWORD),
    ).rejects.toMatchObject({ code: "investigation_incomplete" });
    await saveInvestigation(ctxFor(s.investigator), dev.id, {
      rootCauseMethod: "FIVE_WHYS",
      rootCause: "Falla del compresor por falta de mantenimiento preventivo.",
      impactAssessment:
        "Producto termoestable 15-25 °C: sin impacto en la calidad según estudio de estabilidad.",
      productDisposition: "Liberar el lote tras evaluación de QA.",
      conclusion: "Desviación mayor con causa raíz en mantenimiento.",
    });
    // Se exige CAPA: el investigador la crea vinculada.
    await expect(
      submitInvestigation(ctxFor(s.investigator), dev.id, PASSWORD),
    ).rejects.toMatchObject({ code: "capa_required" });
    const capa = await createCapa(ctxFor(s.investigator), {
      title: "Plan de mantenimiento preventivo de cámaras frías",
      source: "DEVIATION",
      deviationId: dev.id,
      problemStatement: "Excursiones de temperatura por fallas de compresor.",
      type: "CORRECTIVE",
      ownerId: s.investigator.id,
      effectivenessCriteria: "Cero excursiones en 3 meses.",
      targetDate: inDays(60),
    });
    expect(capa.code).toMatch(/^CAPA-\d{4}-0001$/);
    await submitInvestigation(ctxFor(s.investigator), dev.id, PASSWORD);

    // Segregación: el investigador no cierra su propia investigación aunque tuviera permiso QA.
    await prisma.user.update({
      where: { id: s.investigator.id },
      data: { permissions: ["QA_APPROVE"] },
    });
    await expect(
      closeDeviation(ctxFor(s.investigator), dev.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "segregation_of_duties" });
    await prisma.user.update({ where: { id: s.investigator.id }, data: { permissions: [] } });

    await expect(
      closeDeviation(ctxFor(s.qa), dev.id, { decision: "reject", comment: "", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "reason_required" });
    const returned = await closeDeviation(ctxFor(s.qa), dev.id, {
      decision: "reject",
      comment: "Adjuntar el registro del datalogger.",
      password: PASSWORD,
    });
    expect(returned.status).toBe("UNDER_INVESTIGATION");
    await submitInvestigation(ctxFor(s.investigator), dev.id, PASSWORD);
    const closed = await closeDeviation(ctxFor(s.qa), dev.id, {
      decision: "approve",
      password: PASSWORD,
    });
    expect(closed.status).toBe("CLOSED");

    const full = await getDeviation(ctxFor(s.qa).db, dev.id);
    expect(full?.signatures.map((x) => x.meaning)).toEqual([
      "AUTHORED",
      "REJECTED",
      "AUTHORED",
      "APPROVED",
    ]);
    expect(full?.signatures.every(verifySignatureHash)).toBe(true);
    expect(full?.capas).toHaveLength(1);
  });

  it("validaciones: fecha futura, descarte por QA y crítica exige CAPA", async () => {
    await expect(
      reportDeviation(ctxFor(s.operator), {
        title: "X",
        description: "Descripción suficiente",
        category: "OTHER",
        processId: s.process.id,
        detectedAt: inDays(3),
        immediateAction: "Ninguna",
      }),
    ).rejects.toMatchObject({ code: "date_in_future" });
    const d = await report(s, "No es desviación");
    await dismissDeviation(ctxFor(s.qa), d.id, "Evento dentro de especificación.");
    expect((await prisma.deviation.findUnique({ where: { id: d.id } }))?.status).toBe("CANCELLED");
    const c = await report(s, "Crítica");
    const t = await triageDeviation(ctxFor(s.qa), c.id, {
      classification: "CRITICAL",
      investigatorId: s.investigator.id,
      capaRequired: false,
    });
    expect(t.capaRequired).toBe(true);
  });
});

describe("CAPA", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    s = await setup();
  });

  it("plan aprobado → acciones con evidencia → eficacia verificada por otra persona", async () => {
    await expect(
      createCapa(ctxFor(s.operator), {
        title: "Hallazgo de auditoría",
        source: "AUDIT",
        problemStatement: "Registros incompletos en almacén.",
        type: "CORRECTIVE",
        ownerId: s.operator.id,
        effectivenessCriteria: "Auditoría sin hallazgos",
        targetDate: inDays(30),
      }),
    ).rejects.toMatchObject({ code: "forbidden" });
    const capa = await createCapa(ctxFor(s.qa), {
      title: "Hallazgo de auditoría interna",
      source: "AUDIT",
      sourceReference: "AUD-2026-03",
      problemStatement: "Registros de temperatura incompletos en almacén.",
      type: "BOTH",
      ownerId: s.operator.id,
      effectivenessCriteria: "Siguiente auditoría sin hallazgos en registros.",
      targetDate: inDays(45),
    });
    await expect(
      approveCapaPlan(ctxFor(s.qa), capa.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "actions_required" });
    const a1 = await addCapaAction(ctxFor(s.operator), capa.id, {
      description: "Capacitar al personal de almacén",
      responsibleId: s.operator.id,
      dueDate: inDays(10),
    });
    const a2 = await addCapaAction(ctxFor(s.qa), capa.id, {
      description: "Actualizar POE de registro",
      responsibleId: s.investigator.id,
      dueDate: inDays(20),
    });
    await expect(
      addCapaAction(ctxFor(s.operator), capa.id, {
        description: "Fecha pasada",
        responsibleId: s.operator.id,
        dueDate: "2020-01-01",
      }),
    ).rejects.toMatchObject({ code: "date_in_past" });

    // Las acciones no se ejecutan hasta aprobar el plan.
    await expect(
      completeAction(ctxFor(s.operator), a1.id, "Capacitación realizada"),
    ).rejects.toMatchObject({ code: "invalid_state" });
    await approveCapaPlan(ctxFor(s.qa), capa.id, { decision: "approve", password: PASSWORD });

    await expect(
      completeAction(ctxFor(s.operator), a2.id, "No soy responsable"),
    ).rejects.toMatchObject({ code: "forbidden" });
    await completeAction(
      ctxFor(s.operator),
      a1.id,
      "Capacitación realizada el 26/11, registro RH-045.",
    );
    await expect(requestEffectivenessCheck(ctxFor(s.operator), capa.id)).rejects.toMatchObject({
      code: "actions_pending",
    });
    await cancelAction(ctxFor(s.qa), a2.id, "Cubierto por el control de cambios CC-2026-0001.");
    await requestEffectivenessCheck(ctxFor(s.operator), capa.id, inDays(90));

    await expect(
      verifyEffectiveness(ctxFor(s.qa), capa.id, {
        decision: "effective",
        result: "corto",
        password: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "effectiveness_result_required" });
    const notEff = await verifyEffectiveness(ctxFor(s.qa), capa.id, {
      decision: "not_effective",
      result: "Se repitió un registro incompleto en diciembre.",
      password: PASSWORD,
    });
    expect(notEff.status).toBe("IN_PROGRESS");
    const a3 = await addCapaAction(ctxFor(s.operator), capa.id, {
      description: "Implementar registro electrónico",
      responsibleId: s.operator.id,
      dueDate: inDays(15),
    });
    await completeAction(ctxFor(s.operator), a3.id, "Registro electrónico activo desde el 10/12.");
    await requestEffectivenessCheck(ctxFor(s.operator), capa.id);
    const closed = await verifyEffectiveness(ctxFor(s.qa2), capa.id, {
      decision: "effective",
      result: "Tres meses sin hallazgos en registros de almacén.",
      password: PASSWORD,
    });
    expect(closed.status).toBe("CLOSED");

    const full = await getCapa(ctxFor(s.qa).db, capa.id);
    expect(full?.signatures.map((x) => x.meaning)).toEqual(["APPROVED", "REJECTED", "VERIFIED"]);
    expect(full?.actions.map((a) => a.status)).toEqual(["DONE", "CANCELLED", "DONE"]);
  });

  it("el responsable de la CAPA no aprueba ni verifica su propio plan", async () => {
    const capa = await createCapa(ctxFor(s.qa), {
      title: "Propia",
      source: "OTHER",
      problemStatement: "Problema detectado en revisión.",
      type: "PREVENTIVE",
      ownerId: s.qa.id,
      effectivenessCriteria: "Sin recurrencia",
      targetDate: inDays(30),
    });
    await addCapaAction(ctxFor(s.qa), capa.id, {
      description: "Acción preventiva",
      responsibleId: s.qa.id,
      dueDate: inDays(5),
    });
    await expect(
      approveCapaPlan(ctxFor(s.qa), capa.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "segregation_of_duties" });
    await cancelCapa(ctxFor(s.qa2), capa.id, "Duplicada con CAPA anterior.");
    expect(
      (await prisma.qualityAction.findMany({ where: { capaId: capa.id } })).every(
        (a) => a.status === "CANCELLED",
      ),
    ).toBe(true);
  });
});

describe("control de cambios", () => {
  let s: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    s = await setup();
  });

  const input = (s: Awaited<ReturnType<typeof setup>>) => ({
    title: "Cambio de proveedor de cajas térmicas",
    description: "Sustituir el proveedor actual de cajas térmicas por uno calificado.",
    justification: "El proveedor actual discontinúa el modelo validado.",
    changeType: "STORAGE_DISTRIBUTION" as const,
    processId: s.process.id,
    affectedItems: "POE-ALM-012, cajas modelo T-24",
    plannedDate: inDays(30),
  });

  it("propuesta → evaluación → aprobación → implementación → cierre verificado", async () => {
    const change = await createChange(ctxFor(s.operator), input(s));
    expect(change.code).toMatch(/^CC-\d{4}-0001$/);
    await submitChange(ctxFor(s.operator), change.id, PASSWORD);

    await expect(
      decideChange(ctxFor(s.qa), change.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "assessment_incomplete" });
    await saveAssessment(ctxFor(s.qa), change.id, {
      classification: "MAJOR",
      riskLevel: "MEDIUM",
      regulatoryNotification: false,
      impactQuality: "Requiere calificación de desempeño del nuevo embalaje.",
      impactValidation: "Estudio térmico de 48 h en ruta Guayaquil–Quito.",
      impactDocuments: "Actualizar POE-ALM-012.",
      impactTraining: "Capacitar a despacho.",
    });
    await expect(
      decideChange(ctxFor(s.qa), change.id, { decision: "approve", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "actions_required" });
    await expect(
      addChangeAction(ctxFor(s.operator), change.id, {
        description: "Calificar embalaje",
        responsibleId: s.operator.id,
        dueDate: inDays(10),
      }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
    const action = await addChangeAction(ctxFor(s.qa), change.id, {
      description: "Calificación térmica del nuevo embalaje",
      responsibleId: s.operator.id,
      dueDate: inDays(10),
    });
    await decideChange(ctxFor(s.qa), change.id, { decision: "approve", password: PASSWORD });

    await expect(markImplemented(ctxFor(s.operator), change.id)).rejects.toMatchObject({
      code: "actions_pending",
    });
    await completeAction(
      ctxFor(s.operator),
      action.id,
      "Informe de calificación INF-ALM-033 aprobado.",
    );
    await markImplemented(ctxFor(s.operator), change.id);
    await expect(
      closeChange(ctxFor(s.operator), change.id, "Cierre por el solicitante", PASSWORD),
    ).rejects.toMatchObject({ code: "forbidden" });
    const closed = await closeChange(
      ctxFor(s.qa),
      change.id,
      "Embalaje calificado y en uso sin excursiones.",
      PASSWORD,
    );
    expect(closed.status).toBe("CLOSED");
    const full = await getChange(ctxFor(s.qa).db, change.id);
    expect(full?.signatures.map((x) => x.meaning)).toEqual(["AUTHORED", "APPROVED", "VERIFIED"]);
  });

  it("QA no evalúa su propio cambio; devolver y rechazar exigen motivo", async () => {
    const own = await createChange(ctxFor(s.qa), input(s));
    await submitChange(ctxFor(s.qa), own.id, PASSWORD);
    await expect(
      saveAssessment(ctxFor(s.qa), own.id, {
        classification: "MINOR",
        riskLevel: "LOW",
        regulatoryNotification: false,
        impactQuality: "Sin impacto",
      }),
    ).rejects.toMatchObject({ code: "segregation_of_duties" });
    await expect(
      decideChange(ctxFor(s.qa2), own.id, { decision: "return", comment: "", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "reason_required" });
    const back = await decideChange(ctxFor(s.qa2), own.id, {
      decision: "return",
      comment: "Falta el análisis de riesgo del proveedor.",
      password: PASSWORD,
    });
    expect(back.status).toBe("DRAFT");
    await submitChange(ctxFor(s.qa), own.id, PASSWORD);
    const rejected = await decideChange(ctxFor(s.qa2), own.id, {
      decision: "reject",
      comment: "El cambio no está justificado.",
      password: PASSWORD,
    });
    expect(rejected.status).toBe("REJECTED");
    await expect(cancelChange(ctxFor(s.qa2), own.id, "Ya rechazado")).rejects.toMatchObject({
      code: "invalid_state",
    });
  });

  it("bandeja de pendientes por persona", async () => {
    const change = await createChange(ctxFor(s.operator), input(s));
    await submitChange(ctxFor(s.operator), change.id, PASSWORD);
    const qaInbox = await getQualityInbox(ctxFor(s.qa));
    expect(qaInbox.changesToAssess.map((c) => c.id)).toContain(change.id);
    const opInbox = await getQualityInbox(ctxFor(s.operator));
    expect(opInbox.qa).toBe(false);
    expect(opInbox.changesToAssess).toHaveLength(0);
  });
});

describe("aislamiento entre empresas en Calidad", () => {
  it("no se ve ni se actúa sobre registros de otra empresa, y los correlativos son por empresa", async () => {
    const a = await setup();
    const b = await setup();
    const devA = await report(a);
    const devB = await report(b);
    expect(devB.code).toBe(devA.code); // cada empresa tiene su propia numeración
    expect(await getDeviation(ctxFor(b.qa).db, devA.id)).toBeNull();
    await expect(
      triageDeviation(ctxFor(b.qa), devA.id, {
        classification: "MINOR",
        investigatorId: b.investigator.id,
        capaRequired: false,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      triageDeviation(ctxFor(a.qa), devA.id, {
        classification: "MINOR",
        investigatorId: b.investigator.id,
        capaRequired: false,
      }),
    ).rejects.toMatchObject({ code: "invalid_user" });
    await expect(
      createCapa(ctxFor(b.qa), {
        title: "Vínculo ajeno",
        source: "DEVIATION",
        deviationId: devA.id,
        problemStatement: "Intento de vincular otra empresa",
        type: "CORRECTIVE",
        ownerId: b.qa.id,
        effectivenessCriteria: "N/A",
        targetDate: inDays(10),
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
