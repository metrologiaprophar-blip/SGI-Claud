import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}`, locale: "es-ES", trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    port: PORT,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      DATABASE_PROVIDER: "sqlite",
      DATABASE_URL: "file:./e2e.db",
      STORAGE_DIR: "storage-e2e",
      SEED_FORCE_PASSWORD_CHANGE: "false",
    },
  },
});
