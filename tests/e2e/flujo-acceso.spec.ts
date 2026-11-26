import { expect, test, type Page } from "@playwright/test";

const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";

async function login(
  page: Page,
  org: string,
  user: string,
  password: string,
  expectSuccess = true,
) {
  await page.goto("/login");
  await page.getByLabel("ID corporativo", { exact: true }).fill(org);
  await page.getByLabel("Usuario", { exact: true }).fill(user);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Acceder al portal" }).click();
  if (expectSuccess) await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function logout(page: Page) {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("logout").click();
  await expect(page).toHaveURL(/\/login/);
}

test.describe.configure({ mode: "serial" });

test("portal de acceso: dos columnas, idiomas y PWA", async ({ page, request }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Bienvenido" })).toBeVisible();
  await expect(page.getByText("Calidad farmacéutica bajo control.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Instalar SGI Cloud/ })).toBeVisible();

  await page.getByTestId("language-switcher").selectOption("en");
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  await page.getByTestId("language-switcher").selectOption("pt");
  await expect(page.getByRole("heading", { name: "Bem-vindo" })).toBeVisible();
  await page.getByTestId("language-switcher").selectOption("es");
  await expect(page.getByRole("heading", { name: "Bienvenido" })).toBeVisible();

  const manifest = await request.get("/manifest.webmanifest");
  expect(manifest.ok()).toBe(true);
  expect((await manifest.json()).name).toBe("SGI Cloud - PROPHAR");
});

test("credenciales incorrectas: mensaje genérico y se conserva el usuario", async ({ page }) => {
  await login(page, "PROPHAR", "admin", "ClaveIncorrecta1", false);
  await expect(page.getByRole("alert").first()).toContainText("Credenciales no válidas");
  await expect(page.getByLabel("Usuario", { exact: true })).toHaveValue("admin");
});

test("rutas privadas exigen sesión", async ({ page }) => {
  await page.goto("/admin/usuarios");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin%2Fusuarios/);
});

test("el administrador crea un usuario con clave temporal", async ({ page }) => {
  await login(page, "PROPHAR", "admin", SEED_PASSWORD);
  await page.goto("/admin/usuarios");
  await page.getByTestId("new-user").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Usuario").fill("qa.analista");
  await dialog.getByLabel("Nombre completo").fill("Analista de Calidad");
  await dialog.getByLabel("Cargo").fill("Garantía de Calidad");
  await dialog.getByRole("button", { name: "Crear" }).click();
  await expect(dialog.getByTestId("temporary-password")).toBeVisible();
  await dialog.getByRole("button", { name: "Cerrar", exact: true }).last().click();
  await expect(page.getByTestId("user-row-qa.analista")).toContainText("Debe cambiar clave");

  // Usuario duplicado: error y el formulario conserva los datos
  await page.getByTestId("new-user").click();
  await dialog.getByLabel("Usuario").fill("qa.analista");
  await dialog.getByLabel("Nombre completo").fill("Otra Persona");
  await dialog.getByRole("button", { name: "Crear" }).click();
  await expect(dialog.getByText("Ese usuario ya existe en su empresa.")).toBeVisible();
  await expect(dialog.getByLabel("Nombre completo")).toHaveValue("Otra Persona");
});

test("¿Olvidó su clave? → aprobación del admin → clave temporal → cambio obligatorio", async ({
  page,
}) => {
  // 1. El usuario (creado en la prueba anterior, para no alterar los usuarios del seed) solicita el restablecimiento
  await page.goto("/login");
  await page.getByRole("button", { name: "¿Olvidó su clave?" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ID corporativo", { exact: true }).fill("PROPHAR");
  await dialog.getByLabel("Usuario").fill("qa.analista");
  await dialog.getByLabel(/Comentario/).fill("Extensión 214");
  await dialog.getByRole("button", { name: "Enviar solicitud" }).click();
  await expect(
    dialog.getByText(/el administrador de su empresa recibirá la solicitud/),
  ).toBeVisible();

  // 2. El administrador la aprueba
  await login(page, "PROPHAR", "admin", SEED_PASSWORD);
  await expect(page).toHaveURL(/\/inicio/);
  await expect(page.getByTestId("pending-resets-badge")).toHaveText("1");
  await page.goto("/admin/solicitudes-clave");
  const card = page.getByTestId("reset-request-qa.analista");
  await expect(card).toContainText("Extensión 214");
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Aprobar y generar clave" }).click();
  const temporary = (await page.getByTestId("temporary-password").innerText()).trim();
  expect(temporary).toMatch(/^[A-Za-z0-9]{12}$/);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .last()
    .click();

  // 3. Queda en el registro de auditoría
  await page.goto("/admin/auditoria");
  await expect(page.getByText("Solicitud de clave aprobada").first()).toBeVisible();
  await logout(page);

  // 4. El usuario entra con la clave temporal y debe cambiarla
  await login(page, "PROPHAR", "qa.analista", temporary);
  await expect(page).toHaveURL(/\/cambiar-clave/);
  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/cambiar-clave/);
  await page.locator("#currentPassword").fill(temporary);
  await page.locator("#newPassword").fill("Metro2026Calibra");
  await page.locator("#confirmPassword").fill("Metro2026Calibra");
  await page.getByRole("button", { name: "Actualizar contraseña" }).click();
  await expect(page).toHaveURL(/\/inicio\?clave=actualizada/);
  await expect(page.getByText("Su contraseña se actualizó correctamente.")).toBeVisible();

  // 5. Un USUARIO no ve ni accede a Administración
  await expect(page.getByTestId("area-admin")).toHaveCount(0);
  const res = await page.goto("/admin/usuarios");
  expect(res?.status()).toBe(404);
});
