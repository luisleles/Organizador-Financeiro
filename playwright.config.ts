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
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx scripts/preparar-e2e.ts && npm run build && npx next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/saude`,
    /**
     * Nunca reaproveita servidor. O banco é recriado a cada rodada, e um
     * servidor de antes continuaria segurando o arquivo antigo — que já foi apagado. O
     * sintoma é cruel: as escritas parecem funcionar, as leituras seguintes falham com
     * `disk I/O error`, e o teste acusa a tela em vez do ambiente.
     */
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL,
      AUTH_SECRET: "segredo-de-teste-e2e-nao-use-em-producao",
      NODE_ENV: "production",
      /**
       * Fixa o endereço canônico do servidor de teste. Sem isto, o `AUTH_URL` do `.env` da
       * máquina — que aponta para o endereço do Tailscale em quem já configurou o acesso
       * pelo celular — faz o login redirecionar para fora do teste. A suíte quebraria numa
       * máquina e passaria em outra, pelo estado do ambiente e não pelo código.
       */
      AUTH_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});
