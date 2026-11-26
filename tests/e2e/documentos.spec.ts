import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const CODE = "POE-MET-001";

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

async function openDocument(page: Page) {
  await page.goto("/documentos/listado-maestro");
  await page.getByTestId(`doc-row-${CODE}`).getByRole("link", { name: CODE }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Calibración de balanzas analíticas",
  );
}

test.describe.configure({ mode: "serial" });

test("elaboración: alta, archivo y envío a revisión con firma", async ({ page }) => {
  await login(page, "metrologia");
  await page.goto("/documentos/listado-maestro");
  await page.getByTestId("new-document").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Código").fill(CODE);
  await dialog.getByLabel("Título").fill("Calibración de balanzas analíticas");
  await dialog.getByLabel("Proceso").selectOption({ label: "MET · Metrología" });
  await dialog.getByLabel("ISO/IEC 17025").check();
  await dialog.getByRole("button", { name: "Crear documento" }).click();
  await expect(page).toHaveURL(/\/documentos\/doc\//);

  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: "poe-balanzas.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByRole("button", { name: "Subir archivo" }).click();
  await expect(page.getByText("Enviar a revisión", { exact: true })).toBeVisible();

  await page
    .getByLabel("Revisor")
    .selectOption({ label: "Analista de Garantía de Calidad · Analista de Garantía de Calidad" });
  await page
    .getByLabel("Aprobador")
    .selectOption({ label: "Administrador SGI · Jefe de Garantía de Calidad" });
  await page
    .getByRole("checkbox", {
      name: "Analista de Garantía de Calidad · Analista de Garantía de Calidad",
    })
    .check();

  // Contraseña incorrecta: no firma
  await page.getByLabel("Contraseña para firmar").fill("incorrecta-123");
  await page.getByRole("button", { name: "Firmar y enviar a revisión" }).click();
  await expect(page.getByText("Contraseña incorrecta. La firma no se registró.")).toBeVisible();

  await page.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await page.getByRole("button", { name: "Firmar y enviar a revisión" }).click();
  await expect(
    page.getByText("Esperando la acción de Analista de Garantía de Calidad."),
  ).toBeVisible();
  await logout(page);
});

test("revisión: el revisor lo encuentra en su bandeja y firma", async ({ page }) => {
  await login(page, "calidad");
  await page.goto("/documentos/bandeja-revision");
  await expect(page.getByTestId("inbox-toReview")).toContainText(CODE);
  await page.getByTestId("inbox-toReview").getByRole("link").first().click();
  await page.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await page.getByRole("button", { name: "Firmar como revisado" }).click();
  await expect(page.getByText("Esperando la acción de Administrador SGI.")).toBeVisible();
  await logout(page);
});

test("aprobación: entra en vigencia con tres firmas íntegras y se descarga", async ({ page }) => {
  await login(page, "admin");
  await openDocument(page);
  await page.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await page.getByRole("button", { name: "Firmar como aprobado" }).click();
  await expect(page.getByTestId("version-row-1")).toContainText("Vigente");
  const signatures = page.getByTestId("signatures-table");
  await expect(signatures.locator("tbody tr")).toHaveCount(3);
  await expect(signatures).toContainText("Elaboró");
  await expect(signatures).toContainText("Revisó");
  await expect(signatures).toContainText("Aprobó");
  await expect(signatures.getByText("Firma íntegra")).toHaveCount(3);

  const download = page.waitForEvent("download");
  await page.getByTestId("download-current").click();
  expect((await download).suggestedFilename()).toBe(`${CODE}_v1_poe-balanzas.pdf`);

  await page.goto("/documentos/listado-maestro");
  await expect(page.getByTestId(`doc-row-${CODE}`)).toContainText("Vigente");
  await logout(page);
});

test("lectura obligatoria firmada por el lector", async ({ page }) => {
  await login(page, "calidad");
  await page.goto("/documentos/bandeja-revision");
  await expect(page.getByTestId("inbox-reads")).toContainText(CODE);
  await openDocument(page);
  await page.getByLabel("Contraseña para firmar").fill(PASSWORD);
  await page.getByRole("button", { name: "Firmar lectura" }).click();
  await expect(page.getByText("Lecturas confirmadas: 1 de 1")).toBeVisible();
  await page.goto("/documentos/mis-firmas");
  await expect(page.getByRole("cell", { name: "Leído y comprendido" })).toBeVisible();
});
