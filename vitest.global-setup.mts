import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import { TEST_DATABASE_FILE, TEST_DATABASE_URL } from "./vitest.database";

/**
 * Os testes de serviço rodam contra um SQLite descartável: provar que as duas pernas de
 * uma transferência mudam juntas exige uma transação de banco de verdade, não um dublê.
 */
export default function setup() {
  rmSync(TEST_DATABASE_FILE, { force: true });
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "pipe",
  });
}
