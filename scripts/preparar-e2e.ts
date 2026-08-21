import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { E2E_EMAIL, E2E_PASSWORD } from "../e2e/credenciais";

/**
 * Recria o banco descartável do E2E e o semeia.
 *
 * Roda **antes** do servidor subir, e não no `globalSetup` do Playwright: o `webServer`
 * começa primeiro, e um servidor que já abriu o arquivo continua escrevendo no inode
 * apagado quando o setup o recria. As escritas parecem funcionar, as leituras seguintes
 * quebram com `disk I/O error`, e o teste acusa a tela em vez do ambiente.
 */
const ARQUIVO = resolve(process.cwd(), "data/e2e.db");
const DATABASE_URL = "file:../data/e2e.db";

// Com WAL o banco são três arquivos; deixar um WAL órfão para trás dá o mesmo erro.
for (const sufixo of ["", "-journal", "-wal", "-shm"]) {
  rmSync(`${ARQUIVO}${sufixo}`, { force: true });
}

const env = {
  ...process.env,
  DATABASE_URL,
  SEED_EMAIL: E2E_EMAIL,
  SEED_PASSWORD: E2E_PASSWORD,
  SEED_NAME: "Pessoa de Teste",
};

execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });

console.log("Banco de E2E pronto.");
