import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

async function login(page: Page, user: string) {
  await page.goto("/login");
  await page.getByLabel("ID corporativo", { exact: true }).fill("PROPHAR");
  await page.getByLabel("Usuario", { exact: true }).fill(user);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: "Acceder al portal" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/login/);
}

async function openRow(page: Page, list: string, testId: string) {
  await page.goto(`${list}?ver=todos`);
  await page.getByTestId(testId).getByRole("link").first().click();
  await page.waitForURL(new RegExp(`${list}/`));
}

test.describe.configure({ mode: "serial" });

test("desviación: reporte por un usuario y clasificación por QA", async ({ page }) => {
  await login(page, "metrologia");
  await page.goto("/calidad/desviaciones");
  await page.getByTestId("new-deviation").click();
  const form = page.getByTestId("form-report-deviation");
  await form.getByLabel("Título").fill("Excursión de temperatura en cámara fría 2");
  await form.getByLabel("Categoría").selectOption({ label: "Almacenamiento y transporte" });
  await form.getByLabel("Proceso").selectOption({ label: "ALM · Almacenamiento y Distribución" });
  await form
    .getByLabel("Descripción de lo ocurrido")
    .fill("El registrador marcó 9,4 °C durante 3 horas.");
  await form.getByLabel("Lotes afectados").fill("L2611-045");
  await form.getByLabel("Acción inmediata (contención)").fill("Producto en cuarentena.");
  await form.getByRole("button", { name: "Reportar desviación" }).click();
  await expect(page).toHaveURL(/\/calidad\/desviaciones\/c/);
  await expect(page.getByText(/DEV-\d{4}-0001/)).toBeVisible();
  await expect(page.getByText("Esperando la revisión de Garantía de Calidad.")).toBeVisible();
  await logout(page);

  await login(page, "calidad");
  await page.goto("/calidad");
  await expect(page.getByTestId("quality-inbox-toTriage")).toContainText("DEV-");
  await openRow(
    page,
    "/calidad/desviaciones",
    "deviation-row-" +
      (await page.getByTestId("quality-inbox-toTriage").locator(".font-mono").first().innerText()),
  );
  const triage = page.getByTestId("form-triage");
  await triage.getByLabel("Clasificación").selectOption({ label: "Mayor" });
  await triage.getByLabel("Investigador").selectOption({ label: "Responsable de Metrología" });
  await triage.getByLabel("Requiere CAPA").check();
  await triage.getByRole("button", { name: "Clasificar y asignar" }).click();
  await expect(page.getByText("En investigación").first()).toBeVisible();
  await logout(page);
});

test("investigación con CAPA vinculada y envío firmado a QA", async ({ page }) => {
  await login(page, "metrologia");
  await openRow(
    page,
    "/calidad/desviaciones",
    "deviation-row-" + (await firstCode(page, "/calidad/desviaciones")),
  );
  const inv = page.getByTestId("form-investigation");
  await inv.getByLabel("Método de análisis").selectOption({ label: "5 porqués" });
  await inv
    .getByLabel("Causa raíz")
    .fill("Falla del compresor por falta de mantenimiento preventivo.");
  await inv
    .getByLabel("Evaluación del impacto en la calidad del producto")
    .fill("Sin impacto según estudio de estabilidad.");
  await inv.getByLabel("Conclusión").fill("Desviación mayor con causa en mantenimiento.");
  await inv.getByRole("button", { name: "Guardar avance" }).click();
  await expect(inv.getByText("Cambios guardados")).toBeVisible();

  // Sin CAPA no se puede enviar
  await page
    .getByTestId("form-submit-investigation")
    .getByLabel("Contraseña para firmar")
    .fill(PASSWORD);
  await page
    .getByTestId("form-submit-investigation")
    .getByRole("button", { name: "Firmar y enviar a QA" })
    .click();
  await expect(page.getByText("Esta desviación exige al menos una CAPA vinculada.")).toBeVisible();

  const deviationUrl = page.url();
  await page.getByTestId("new-linked-capa").click();
  const capa = page.getByTestId("form-linked-capa");
  await capa.getByLabel("Fecha objetivo").fill(inDays(60));
  await capa.getByLabel("Criterio de eficacia").fill("Cero excursiones en 3 meses.");
  await capa.getByRole("button", { name: "Nueva CAPA" }).click();
  await expect(page).toHaveURL(/\/calidad\/capa\/c/);
  const add = page.getByTestId("form-add-action");
  await add.getByLabel("Acción").fill("Incluir compresores en el plan de mantenimiento preventivo");
  await add.getByLabel("Responsable").selectOption({ label: "Responsable de Metrología" });
  await add.getByLabel("Plazo").fill(inDays(20));
  await add.getByRole("button", { name: "Añadir acción" }).click();
  await expect(page.getByTestId("action-plan")).toContainText("plan de mantenimiento preventivo");

  await page.goto(deviationUrl);
  await page
    .getByTestId("form-submit-investigation")
    .getByLabel("Contraseña para firmar")
    .fill(PASSWORD);
  await page
    .getByTestId("form-submit-investigation")
    .getByRole("button", { name: "Firmar y enviar a QA" })
    .click();
  await expect(page.getByText("Esperando la revisión de Garantía de Calidad.")).toBeVisible();
  await logout(page);
});

test("QA aprueba el plan CAPA y cierra la desviación con firma", async ({ page }) => {
  await login(page, "admin");
  await page.goto("/calidad");
  await page.getByTestId("quality-inbox-capaToApprove").getByRole("link").first().click();
  const plan = page.getByTestId("form-approve-plan");
  await plan.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await plan.getByRole("button", { name: "Firmar aprobación del plan" }).click();
  await expect(page.getByText("En ejecución").first()).toBeVisible();

  await page.goto("/calidad");
  await page.getByTestId("quality-inbox-devToClose").getByRole("link").first().click();
  const close = page.getByTestId("form-close-deviation");
  await close.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await close.getByRole("button", { name: "Firmar cierre" }).click();
  await expect(page.getByText("Cerrada").first()).toBeVisible();
  const sigs = page.getByTestId("signatures-table");
  await expect(sigs.locator("tbody tr")).toHaveCount(2);
  await expect(sigs.getByText("Firma íntegra")).toHaveCount(2);
  await logout(page);
});

test("ejecución de la acción y verificación de eficacia por otra persona", async ({ page }) => {
  await login(page, "metrologia");
  await page.goto("/calidad");
  await page.getByTestId("quality-inbox-myActions").getByRole("link").first().click();
  await page.getByRole("button", { name: "Registrar ejecución" }).click();
  const done = page.getByRole("dialog").locator("form");
  await done.getByLabel("Evidencia de la ejecución").fill("Plan MAN-2026 actualizado, OT-778.");
  await done.getByRole("button", { name: "Registrar ejecución" }).click();
  await expect(page.getByTestId("action-plan")).toContainText("Ejecutada");
  await page
    .getByTestId("form-request-effectiveness")
    .getByRole("button", { name: "Solicitar verificación" })
    .click();
  await expect(page.getByText("Verificación de eficacia").first()).toBeVisible();
  await logout(page);

  await login(page, "calidad");
  await page.goto("/calidad");
  await page.getByTestId("quality-inbox-capaToVerify").getByRole("link").first().click();
  const verify = page.getByTestId("form-verify-effectiveness");
  await verify
    .getByLabel("Resultado de la verificación")
    .fill("Tres meses sin excursiones de temperatura.");
  await verify.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await verify.getByRole("button", { name: "Firmar: eficaz y cerrar" }).click();
  await expect(page.getByText("Cerrada").first()).toBeVisible();
  await expect(page.getByTestId("signatures-table")).toContainText("Verificó");
  await logout(page);
});

test("control de cambios: propuesta, evaluación, aprobación, implementación y cierre", async ({
  page,
}) => {
  await login(page, "metrologia");
  await page.goto("/calidad/control-cambios");
  await page.getByTestId("new-change").click();
  const form = page.getByTestId("form-new-change");
  await form.getByLabel("Título").fill("Nuevo proveedor de cajas térmicas");
  await form.getByLabel("Tipo de cambio").selectOption({ label: "Almacenamiento y distribución" });
  await form.getByLabel("Proceso").selectOption({ label: "ALM · Almacenamiento y Distribución" });
  await form.getByLabel("Descripción del cambio").fill("Sustituir el proveedor de cajas térmicas.");
  await form.getByLabel("Justificación").fill("El modelo validado se discontinúa.");
  await form.getByRole("button", { name: "Proponer cambio" }).click();
  await expect(page).toHaveURL(/\/calidad\/control-cambios\/c/);
  const changeUrl = page.url();
  await page.getByTestId("form-submit-change").getByLabel("Contraseña para firmar").fill(PASSWORD);
  await page
    .getByTestId("form-submit-change")
    .getByRole("button", { name: "Firmar y enviar a evaluación" })
    .click();
  await expect(page.getByText("En evaluación").first()).toBeVisible();
  await logout(page);

  await login(page, "calidad");
  await page.goto(changeUrl);
  const assess = page.getByTestId("form-assessment");
  await assess.getByLabel("Clasificación").selectOption({ label: "Mayor" });
  await assess.getByLabel("Nivel de riesgo").selectOption({ label: "Medio" });
  await assess.getByLabel("Requiere notificación a ARCSA").selectOption({ label: "No" });
  await assess
    .getByLabel("Impacto en la calidad del producto")
    .fill("Requiere calificación térmica del embalaje.");
  await assess.getByRole("button", { name: "Guardar evaluación" }).click();
  await expect(assess.getByText("Cambios guardados")).toBeVisible();
  const add = page.getByTestId("form-add-action");
  await add.getByLabel("Acción").fill("Calificación térmica del nuevo embalaje");
  await add.getByLabel("Responsable").selectOption({ label: "Responsable de Metrología" });
  await add.getByLabel("Plazo").fill(inDays(10));
  await add.getByRole("button", { name: "Añadir acción" }).click();
  await expect(page.getByTestId("action-plan")).toContainText("Calificación térmica");
  const decide = page.getByTestId("form-decide-change");
  await decide.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await decide.getByRole("button", { name: "Firmar aprobación" }).click();
  await expect(page.getByText("Aprobado").first()).toBeVisible();
  await logout(page);

  await login(page, "metrologia");
  await page.goto(changeUrl);
  await page.getByRole("button", { name: "Registrar ejecución" }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Evidencia de la ejecución")
    .fill("Informe INF-ALM-033 aprobado.");
  await page.getByRole("dialog").getByRole("button", { name: "Registrar ejecución" }).click();
  await page
    .getByTestId("form-implement")
    .getByRole("button", { name: "Declarar implementado" })
    .click();
  await expect(page.getByText("Implementado").first()).toBeVisible();
  await logout(page);

  await login(page, "calidad");
  await page.goto(changeUrl);
  const close = page.getByTestId("form-close-change");
  await close
    .getByLabel("Verificación de la implementación")
    .fill("Embalaje calificado y en uso sin excursiones.");
  await close.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await close.getByRole("button", { name: "Firmar verificación y cerrar" }).click();
  await expect(page.getByText("Cerrado").first()).toBeVisible();
  await expect(page.getByTestId("signatures-table").locator("tbody tr")).toHaveCount(3);
});

async function firstCode(page: Page, list: string) {
  await page.goto(`${list}?ver=todos`);
  return (await page.locator("tbody tr td.font-mono").first().innerText()).trim();
}
