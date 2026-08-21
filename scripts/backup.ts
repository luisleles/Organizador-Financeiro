import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "../src/lib/prisma";

/**
 * Backup diário do SQLite, com retenção de 30 dias.
 *
 * `VACUUM INTO` é o jeito certo de copiar um banco em uso: o SQLite escreve um arquivo novo
 * e íntegro, sem depender de o app estar parado. Copiar o `.db` na unha, com o WAL ativo,
 * produziria uma cópia sem as escritas que ainda estão no journal.
 */
const RETENCAO_DIAS = 30;
const PASTA = resolve(process.cwd(), "data/backups");

function nomeDoDia(agora: Date): string {
  const [dia] = agora.toISOString().split("T");
  return `app-${dia}.db`;
}

async function apagarAntigos(agora: Date): Promise<string[]> {
  const limite = agora.getTime() - RETENCAO_DIAS * 24 * 60 * 60 * 1000;
  const apagados: string[] = [];

  for (const arquivo of await readdir(PASTA)) {
    if (!arquivo.startsWith("app-") || !arquivo.endsWith(".db")) continue;

    const caminho = join(PASTA, arquivo);
    const info = await stat(caminho);
    if (info.mtimeMs < limite) {
      await rm(caminho, { force: true });
      apagados.push(arquivo);
    }
  }

  return apagados;
}

async function main() {
  const agora = new Date();
  await mkdir(PASTA, { recursive: true });

  const destino = join(PASTA, nomeDoDia(agora));
  // Rodar duas vezes no mesmo dia sobrescreve o backup do dia, em vez de acumular cópias.
  await rm(destino, { force: true });
  await prisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);

  const { size } = await stat(destino);
  const apagados = await apagarAntigos(agora);
  const restantes = (await readdir(PASTA)).filter((nome) => nome.endsWith(".db"));

  console.log(`Backup gravado: ${destino} (${(size / 1024).toFixed(0)} KB)`);
  console.log(`Retenção de ${RETENCAO_DIAS} dias: ${restantes.length} cópias guardadas.`);
  if (apagados.length > 0) console.log(`Apagados por idade: ${apagados.join(", ")}`);
}

main()
  .catch((error) => {
    console.error("Falha ao gerar o backup", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
