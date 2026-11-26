import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";
const PDF = Buffer.from("%PDF-1.4\n% certificado de calibracion\ntrailer<<>>\n%%EOF\n");

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

async function openEquipment(page: Page, code: string) {
  await page.goto("/metrologia/equipos");
  await page.getByTestId(`equipment-row-${code}`).getByRole("link", { name: code }).click();
  await page.waitForURL(/\/metrologia\/equipos\/c/);
}

async function fillPoints(page: Page, points: [string, string, string][]) {
  for (const [i, [nominal, reading, u]] of points.entries()) {
    await page.getByLabel(`Valor nominal ${i + 1}`).fill(nominal);
    await page.getByLabel(`Lectura del equipo ${i + 1}`).fill(reading);
    await page.getByLabel(`Incertidumbre U (k=2) ${i + 1}`).fill(u);
  }
}

test.describe.configure({ mode: "serial" });

test("panel metrológico muestra la calibración vencida del seed", async ({ page }) => {
  await login(page, "metrologia");
  await page.goto("/metrologia");
  await expect(page.getByTestId("metrology-overdue")).toContainText("TER-012");
  await expect(page.getByTestId("metrology-dueSoon")).toContainText("BAL-001");
  await logout(page);
});

test("calibración externa conforme con certificado y aprobación firmada por otra persona", async ({
  page,
}) => {
  await login(page, "metrologia");
  await openEquipment(page, "BAL-001");
  await page.getByTestId("new-calibration").click();
  const form = page.getByTestId("form-record-calibration");
  await form.getByLabel("Laboratorio / proveedor").fill("Laboratorio acreditado SAE");
  await form.getByLabel("N.º de certificado").fill("CC-2026-1180");
  await fillPoints(page, [
    ["100", "100.0001", "0.0002"],
    ["200", "199.9998", "0.0002"],
  ]);
  await expect(form.getByText("Cumple")).toHaveCount(2);
  await form
    .locator('input[type="file"]')
    .setInputFiles({ name: "certificado.pdf", mimeType: "application/pdf", buffer: PDF });
  await form.getByRole("button", { name: "Registrar calibración" }).click();
  await expect(page).toHaveURL(/\/metrologia\/calibraciones\/c/);
  await expect(page.getByText("Pendiente de aprobación").first()).toBeVisible();
  const calibrationUrl = page.url();
  await logout(page);

  await login(page, "admin");
  await page.goto(calibrationUrl);
  const approve = page.getByTestId("form-approve-calibration");
  await approve.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await approve.getByRole("button", { name: "Firmar aprobación" }).click();
  await expect(page.getByText("Aprobado").first()).toBeVisible();
  await expect(page.getByTestId("signatures-table")).toContainText("Firma íntegra");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar certificado" }).click();
  expect((await download).suggestedFilename()).toMatch(/^CAL-\d{4}-0001_BAL-001_certificado\.pdf$/);
  await page.goto("/metrologia");
  await expect(page.getByTestId("metrology-dashboard")).not.toContainText("BAL-001");
  await logout(page);
});

test("calibración interna no conforme: fuera de servicio y desviación vinculada", async ({
  page,
}) => {
  await login(page, "metrologia");
  await openEquipment(page, "PH-003");
  await page.getByTestId("new-calibration").click();
  const form = page.getByTestId("form-record-calibration");
  await form.getByLabel("Tipo").selectOption({ label: "Interna" });
  await form.getByLabel(/PAT-PES-001/).check();
  await fillPoints(page, [["7.00", "7.04", "0.02"]]);
  await expect(form.getByText("No cumple")).toBeVisible();
  await form.getByRole("button", { name: "Registrar calibración" }).click();
  await expect(page.getByText(/Describa la evaluación de impacto/)).toBeVisible();
  await form
    .getByLabel("Evaluación de impacto en mediciones anteriores")
    .fill("Revisar análisis de pH de los lotes L-2611 a L-2620.");
  await form.getByRole("button", { name: "Registrar calibración" }).click();
  await expect(page).toHaveURL(/\/metrologia\/calibraciones\/c/);
  await expect(
    page.getByText("Resultado no conforme: el equipo quedó fuera de servicio."),
  ).toBeVisible();
  await page
    .getByTestId("form-open-deviation")
    .getByRole("button", { name: "Abrir desviación" })
    .click();
  await expect(page).toHaveURL(/\/calidad\/desviaciones\/c/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("PH-003");
  await openEquipment(page, "PH-003");
  await expect(page.getByText(/Equipo fuera de servicio/)).toBeVisible();
  await logout(page);
});

test("ensayo de aptitud insatisfactorio y CAPA creada por QA", async ({ page }) => {
  await login(page, "metrologia");
  await page.goto("/metrologia/ensayos-aptitud");
  await page.getByTestId("new-proficiency").click();
  const form = page.getByTestId("form-record-proficiency");
  await form.getByLabel("Proveedor").fill("INEN");
  await form.getByLabel("Programa").fill("pH en soluciones");
  await form.getByLabel("Ronda").fill("2026-2");
  await form.getByLabel("Mensurando").fill("pH 7");
  await form.getByLabel("Puntuación z").fill("-3.4");
  await form.getByRole("button", { name: "Registrar ensayo de aptitud" }).click();
  await expect(page).toHaveURL(/\/metrologia\/ensayos-aptitud\/c/);
  await expect(page.getByText("Resultado insatisfactorio: se requiere una CAPA.")).toBeVisible();
  const ptUrl = page.url();
  await logout(page);

  await login(page, "calidad");
  await page.goto(ptUrl);
  await page.getByRole("button", { name: "Crear CAPA" }).click();
  const capa = page.getByTestId("form-proficiency-capa");
  await capa
    .getByLabel("Responsable de la CAPA")
    .selectOption({ label: "Responsable de Metrología" });
  await capa
    .getByLabel("Fecha objetivo")
    .fill(new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  await capa.getByLabel("Criterio de eficacia").fill("|z| ≤ 2 en la siguiente ronda");
  await capa.getByRole("button", { name: "Nueva CAPA" }).click();
  await expect(page).toHaveURL(/\/calidad\/capa\/c/);
  await expect(page.getByText("Ensayo de aptitud").first()).toBeVisible();
});
