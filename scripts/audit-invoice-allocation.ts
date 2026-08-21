import { createInterface } from "node:readline/promises";
import { prisma } from "../src/lib/prisma";
import {
  findMisallocatedGroups,
  reallocateGroup,
  type MisallocatedGroup,
} from "../src/server/accounts/invoice-audit";

/**
 * Encontra compras presas na fatura errada pela regra antiga de alocação — a que recusava
 * lançamento numa fatura já paga, mesmo com ela ainda aberta — e oferece realocação
 * assistida, uma compra de cada vez. Não corrige nada sozinho.
 *
 *   npx tsx scripts/audit-invoice-allocation.ts
 */
async function main() {
  const groups = await findMisallocatedGroups();
  if (groups.length === 0) {
    console.log("Nenhuma compra presa na fatura errada.");
    return;
  }

  console.log(`${groups.length} compra(s) presa(s) na fatura errada:\n`);
  groups.forEach((group, index) => printGroup(group, index));

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let realocadas = 0;
  for (const [index, group] of groups.entries()) {
    console.log(`\n── [${index + 1}/${groups.length}] ${group.description}`);
    const resposta = (await prompt.question("   Realocar esta compra? (s/N): "))
      .trim()
      .toLowerCase();
    if (resposta !== "s") {
      console.log("   Pulada.");
      continue;
    }
    const movidas = await reallocateGroup(group);
    console.log(`   ✓ ${movidas} parcela(s) movida(s) para a fatura certa.`);
    realocadas += 1;
  }
  prompt.close();

  console.log(`\n${realocadas} de ${groups.length} compra(s) realocada(s).`);
}

function printGroup(group: MisallocatedGroup, index: number): void {
  console.log(`[${index + 1}] ${group.accountName} — ${group.description}`);
  for (const installment of group.installments) {
    const marca =
      installment.currentReferenceMonth.getTime() ===
      installment.correctSchedule.referenceMonth.getTime()
        ? "  "
        : "→ ";
    console.log(
      `    ${marca}parcela ${installment.installmentNumber ?? 1}: hoje em ${mes(installment.currentReferenceMonth)}, deveria estar em ${mes(installment.correctSchedule.referenceMonth)}`,
    );
  }
}

function mes(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
