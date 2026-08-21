import { PrismaClient } from "@prisma/client";

declare global {
  var prismaClient: PrismaClient | undefined;
}

/**
 * SQLite em modo WAL. Sem isso, o banco usa um lock exclusivo durante cada escrita, e o
 * app aberto no celular e no desktop ao mesmo tempo — o que passa a ser normal a partir do
 * acesso pela rede — produz `SQLITE_BUSY` em vez de simplesmente esperar.
 *
 * - `journal_mode=WAL`: leitura e escrita deixam de se bloquear.
 * - `busy_timeout=5000`: quando duas escritas coincidem, a segunda espera até 5s em vez de
 *   falhar na hora. Escrita aqui leva milissegundos; 5s é folga de sobra.
 */
async function configureSqlite(client: PrismaClient): Promise<void> {
  try {
    // `journal_mode` devolve o modo aplicado, e o SQLite recusa `execute` que retorna
    // linha — por isso a consulta, e não a execução.
    const [{ journal_mode: modo }] = await client.$queryRawUnsafe<{ journal_mode: string }[]>(
      "PRAGMA journal_mode = WAL;",
    );

    await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
    // Durabilidade suficiente com WAL: o commit não espera o disco a cada transação, e o
    // WAL garante que nada corrompe num crash — só as escritas do último instante se perdem.
    await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL;");

    if (modo?.toLowerCase() !== "wal") {
      console.warn(`SQLite ficou em journal_mode=${modo}, e não em WAL.`);
    }
  } catch (error) {
    console.error("Não foi possível configurar o SQLite", error);
  }
}

function createClient(): PrismaClient {
  const client = new PrismaClient();
  void configureSqlite(client);
  return client;
}

export const prisma = globalThis.prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
