import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

export const E2E_EMAIL = "e2e@example.com";
export const E2E_PASSWORD = "senha-e2e-123456";

/**
 * Banco descartável, recriado do zero a cada rodada: os testes contam com o dataset do seed
 * — contas, categorias e histórico — e precisam do mesmo ponto de partida sempre.
 */
export default function globalSetup() {
  const arquivo = resolve(process.cwd(), "data/e2e.db");
  const DATABASE_URL = "file:../data/e2e.db";

  rmSync(arquivo, { force: true });
  rmSync(`${arquivo}-journal`, { force: true });

  const env = {
    ...process.env,
    DATABASE_URL,
    SEED_EMAIL: E2E_EMAIL,
    SEED_PASSWORD: E2E_PASSWORD,
    SEED_NAME: "Pessoa de Teste",
  };

  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
