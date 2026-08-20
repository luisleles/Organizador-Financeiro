import { createInterface } from "node:readline/promises";
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import {
  applyGoalMigration,
  listPendingGoalMigrations,
  migrationDate,
  type MigrationCase,
  type MigrationOutcome,
} from "../src/server/goals/goal.migration";

/**
 * Materializa as metas antigas como caixinhas.
 *
 *   npx tsx scripts/migrate-goals-to-buckets.ts                  → pergunta meta a meta
 *   npx tsx scripts/migrate-goals-to-buckets.ts mapa.json        → lê as respostas do arquivo
 *
 * O mapa é `{ "<id ou nome da meta>": { "caso": "initial" | "transfer", "contaMae": "<id>" } }`.
 * O script é idempotente: rodar de novo não cria nada em duplicidade.
 */
async function main() {
  const mappingPath = process.argv[2];
  const mapping = mappingPath
    ? (JSON.parse(readFileSync(mappingPath, "utf8")) as Record<
        string,
        { caso: MigrationCase; contaMae: string }
      >)
    : null;

  const pending = await listPendingGoalMigrations();
  if (pending.length === 0) {
    console.log("Nada a migrar: nenhuma meta no snapshot.");
    return;
  }

  const accounts = await prisma.account.findMany({
    where: { class: "ASSET", type: { not: "SAVINGS_BUCKET" }, archived: false },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const date = migrationDate();
  const outcomes: MigrationOutcome[] = [];
  const prompt = mapping ? null : createInterface({ input: process.stdin, output: process.stdout });

  for (const goal of pending) {
    if (goal.resolution !== null) {
      outcomes.push({
        goalId: goal.goalId,
        goalName: goal.goalName,
        action: "skipped",
        resolution: goal.resolution,
        bucketAccountId: null,
        amountCents: 0,
        reason: "já resolvida numa execução anterior",
      });
      continue;
    }

    const answer = mapping
      ? (mapping[goal.goalId] ?? mapping[goal.goalName])
      : await ask(prompt!, goal, accounts);

    if (!answer) {
      outcomes.push({
        goalId: goal.goalId,
        goalName: goal.goalName,
        action: "skipped",
        resolution: null,
        bucketAccountId: null,
        amountCents: 0,
        reason: "sem resposta — nada foi decidido por você",
      });
      continue;
    }

    outcomes.push(
      await applyGoalMigration({
        goalId: goal.goalId,
        parentAccountId: answer.contaMae,
        decision: answer.caso,
        date,
      }),
    );
  }

  prompt?.close();
  printSummary(outcomes);
}

async function ask(
  prompt: ReturnType<typeof createInterface>,
  goal: Awaited<ReturnType<typeof listPendingGoalMigrations>>[number],
  accounts: { id: string; name: string }[],
): Promise<{ caso: MigrationCase; contaMae: string } | null> {
  console.log(`\n── ${goal.goalName}`);
  console.log(
    `   ${goal.contributionCount} aporte(s), total de R$ ${(goal.totalContributedCents / 100).toFixed(2)}`,
  );
  if (goal.previousAccountName)
    console.log(`   conta antes vinculada: ${goal.previousAccountName}`);

  console.log("\n   Onde esse dinheiro está hoje?");
  console.log("   [a] O saldo da conta mãe JÁ estava descontado — vira saldo inicial da caixinha");
  console.log("   [b] O saldo da conta mãe AINDA inclui esse dinheiro — cria uma transferência");
  console.log("   [p] Pular esta meta");

  const caso = (await prompt.question("   Escolha (a/b/p): ")).trim().toLowerCase();
  if (caso === "p" || (caso !== "a" && caso !== "b")) return null;

  console.log("\n   Conta mãe da caixinha:");
  accounts.forEach((account, index) => console.log(`   [${index + 1}] ${account.name}`));

  const chosen = Number((await prompt.question("   Número da conta: ")).trim());
  const account = accounts[chosen - 1];
  if (!account) return null;

  return { caso: caso === "a" ? "initial" : "transfer", contaMae: account.id };
}

function printSummary(outcomes: MigrationOutcome[]) {
  console.log("\n─── Resumo ───");
  for (const outcome of outcomes) {
    const valor = (outcome.amountCents / 100).toFixed(2);
    if (outcome.action === "created") {
      const como =
        outcome.resolution === "initial"
          ? "saldo inicial da caixinha"
          : outcome.resolution === "transfer"
            ? "transferência consolidada"
            : "caixinha vazia";
      console.log(`  ✓ ${outcome.goalName}: R$ ${valor} como ${como}`);
    } else {
      console.log(`  – ${outcome.goalName}: pulada (${outcome.reason})`);
    }
  }

  const created = outcomes.filter((outcome) => outcome.action === "created").length;
  console.log(`\n  ${created} caixinha(s) criada(s), ${outcomes.length - created} pulada(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
