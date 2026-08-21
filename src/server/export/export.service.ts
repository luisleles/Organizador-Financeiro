import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatDate, toISODate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import { csvMoney, toCsv } from "@/server/reports/report.csv";

/**
 * Exportação completa: tudo o que está no banco, sem recorte de período nem de conta. É a
 * saída de emergência do usuário — quem consegue levar os próprios dados embora não fica
 * preso ao app.
 */

export async function exportTransactionsCsv(): Promise<string> {
  const userId = await requireUserId();
  const transactions = await prisma.transaction.findMany({
    where: { userId },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    include: {
      account: { select: { name: true } },
      category: { select: { name: true } },
      tags: { select: { name: true } },
    },
  });

  return toCsv([
    [
      "Data",
      "Descrição",
      "Valor",
      "Tipo",
      "Conta",
      "Categoria",
      "Tags",
      "Observação",
      "Origem",
      "Id externo",
    ],
    ...transactions.map((transaction) => [
      formatDate(transaction.date),
      transaction.description,
      csvMoney(transaction.amountCents),
      TYPE_LABELS[transaction.type],
      transaction.account.name,
      transaction.category?.name ?? "",
      transaction.tags.map((tag) => tag.name).join(", "),
      transaction.notes ?? "",
      transaction.provider ?? "",
      transaction.externalId ?? "",
    ]),
  ]);
}

const TYPE_LABELS = {
  INCOME: "Entrada",
  EXPENSE: "Saída",
  TRANSFER: "Transferência",
} as const;

/**
 * JSON com o banco inteiro do usuário, em estrutura estável e valores em centavos. Serve
 * tanto para levar embora quanto para conferir o que o app guarda.
 */
export async function exportFullJson(): Promise<string> {
  const userId = await requireUserId();

  const [accounts, categories, tags, transactions, budgets, goals, recurringRules] =
    await Promise.all([
      prisma.account.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        include: { creditCardDetails: true },
      }),
      prisma.category.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } }),
      prisma.tag.findMany({ where: { userId }, orderBy: { name: "asc" } }),
      prisma.transaction.findMany({
        where: { userId },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
        include: { tags: { select: { name: true } } },
      }),
      prisma.budget.findMany({ where: { userId }, orderBy: { month: "asc" } }),
      prisma.goal.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
      prisma.recurringRule.findMany({ where: { userId }, include: { overrides: true } }),
    ]);

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      schema: "controle-financeiro/1",
      currency: "BRL",
      note: "Todos os valores são inteiros em centavos. Datas em UTC.",
      accounts,
      categories,
      tags,
      transactions,
      budgets,
      goals,
      recurringRules,
    },
    null,
    2,
  );
}

/**
 * Cópia consistente do arquivo SQLite. `VACUUM INTO` é o jeito certo de copiar um banco em
 * uso: o SQLite escreve um arquivo novo e íntegro, sem depender de o app estar parado.
 */
export async function createDatabaseDump(): Promise<Buffer> {
  const pasta = await mkdtemp(join(tmpdir(), "controle-financeiro-backup-"));
  const destino = join(pasta, "backup.db");

  try {
    await prisma.$executeRawUnsafe(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
    return await readFile(destino);
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}

/** Nome com a data para os arquivos não se sobrescreverem na pasta de downloads. */
export function exportFileName(extension: string): string {
  return `controle-financeiro-${toISODate(new Date())}.${extension}`;
}
