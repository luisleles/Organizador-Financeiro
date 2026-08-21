import { defineConfig, devices } from "@playwright/test";

/**
 * Os testes rodam contra o **build de produção**, e não contra o servidor de
 * desenvolvimento. A diferença já custou caro: o Auth.js confia no host automaticamente em
 * desenvolvimento e recusa em produção, então um login quebrado passaria despercebido num
 * E2E que rodasse com `next dev`.
 */
const PORT = 3100;
const DATABASE_URL = "file:../data/e2e.db";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run build && npx next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/saude`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      AUTH_SECRET: "segredo-de-teste-e2e-nao-use-em-producao",
      NODE_ENV: "production",
    },
  },
});
