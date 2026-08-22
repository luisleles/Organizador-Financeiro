import { createInterface } from "node:readline/promises";
import { prisma } from "../src/lib/prisma";
import {
  convertFindingToInvoicePayment,
  convertFindingToRefund,
  deleteFinding,
  findIncomeOnCreditCard,
  type IncomeOnCardFinding,
} from "../src/server/accounts/income-on-card-audit";
import { formatDate } from "../src/lib/date";

/**
 * Encontra `INCOME` gravado direto numa conta de cartão de crédito — coisa que só existia
 * antes de `assertOperationAllowed` passar a barrar isso em todo caminho de escrita. Não
 * converte nada sozinho: para cada achado, pergunta o que fazer.
 *
 *   npx tsx scripts/audit-income-on-credit-card.ts
 */
async function main() {
  const findings = await findIncomeOnCreditCard();
  if (findings.length === 0) {
    console.log("Nenhuma receita encontrada em conta de cartão de crédito.");
    return;
  }

  console.log(`${findings.length} lançamento(s) de receita em cartão de crédito:\n`);
  findings.forEach(printFinding);

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  let resolvidos = 0;

  for (const [index, finding] of findings.entries()) {
    console.log(
      `\n── [${index + 1}/${findings.length}] ${finding.accountName} — ${finding.description}`,
    );
    const resposta = (
      await prompt.question(
        "   (e)storno, (p)agamento de fatura, (x)excluir, ou Enter para pular: ",
      )
    )
      .trim()
      .toLowerCase();

    if (resposta === "e") {
      await convertFindingToRefund(finding.transactionId);
      console.log("   ✓ Convertido em estorno.");
      resolvidos += 1;
    } else if (resposta === "p") {
      const fromAccountId = (
        await prompt.question("   Id da conta de origem do pagamento: ")
      ).trim();
      if (!fromAccountId) {
        console.log("   Pulado: nenhuma conta informada.");
        continue;
      }
      await convertFindingToInvoicePayment(finding.transactionId, fromAccountId);
      console.log("   ✓ Convertido em pagamento de fatura.");
      resolvidos += 1;
    } else if (resposta === "x") {
      await deleteFinding(finding.transactionId);
      console.log("   ✓ Excluído.");
      resolvidos += 1;
    } else {
      console.log("   Pulado.");
    }
  }
  prompt.close();

  console.log(`\n${resolvidos} de ${findings.length} lançamento(s) resolvido(s).`);
}

function printFinding(finding: IncomeOnCardFinding, index: number): void {
  console.log(
    `[${index + 1}] ${finding.accountName} — ${formatDate(finding.date)} — R$ ${(finding.amountCents / 100).toFixed(2)} — ${finding.description}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
