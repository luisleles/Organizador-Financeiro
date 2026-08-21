import { Prisma } from "@prisma/client";
import { fromISODate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import { createTransaction } from "@/server/transactions/transaction.service";
import { CsvSource } from "./csv.source";
import { buildPreview, type ImportPreview } from "./import.pipeline";
import type { ConfirmImportInput, PreviewRequest } from "./import.schema";
import { OfxSource } from "./ofx.source";
import type { TransactionSource } from "./source";

export type ImportErrorCode = "ACCOUNT_NOT_FOUND" | "EMPTY_FILE" | "NOTHING_SELECTED";

export class ImportServiceError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ImportServiceError";
  }
}

export type ImportResult = {
  createdCount: number;
  /** Linhas que outra importação já tinha gravado enquanto esta estava aberta. */
  skippedCount: number;
};

/**
 * Monta a fonte pedida. É o único lugar que precisa mudar quando entra o Open Finance:
 * uma classe nova, um `case` novo, e o resto do caminho continua igual.
 */
function createSource(request: PreviewRequest): TransactionSource {
  if (request.sourceId === "ofx") return new OfxSource({ text: request.text });

  return new CsvSource({
    text: request.text,
    mapping: request.mapping,
    dateFormat: request.dateFormat,
    headerRows: request.headerRows,
  });
}

/**
 * Roda o pipeline inteiro sem gravar nada: é o que alimenta a tela de revisão. Só depois de
 * o usuário confirmar é que `confirmImport` escreve.
 */
export async function previewImport(request: PreviewRequest): Promise<ImportPreview> {
  const userId = await requireUserId();
  await assertAccount(userId, request.accountId);

  const source = createSource(request);
  const transactions = await source.fetchTransactions({
    accountId: request.accountId,
    since: request.since ? fromISODate(request.since) : new Date(0),
  });

  if (transactions.length === 0) {
    throw new ImportServiceError(
      "EMPTY_FILE",
      "Nenhum lançamento reconhecido no arquivo. Confira o mapeamento das colunas e o formato da data.",
    );
  }

  const [existentes, rules, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        userId,
        provider: source.id,
        externalId: { in: transactions.map((transaction) => transaction.externalId) },
      },
      select: { externalId: true },
    }),
    prisma.categoryRule.findMany({
      where: { userId },
      select: { id: true, pattern: true, categoryId: true, priority: true, active: true },
    }),
    prisma.category.findMany({ where: { userId }, select: { id: true, name: true } }),
  ]);

  return buildPreview({
    transactions,
    existingExternalIds: new Set(
      existentes.map((row) => row.externalId).filter((id): id is string => id !== null),
    ),
    rules,
    categoryNameById: new Map(categories.map((category) => [category.id, category.name])),
  });
}

/** Grava o que foi confirmado na tela. Nada chega aqui sem ter passado pela revisão. */
export async function confirmImport(input: ConfirmImportInput): Promise<ImportResult> {
  const userId = await requireUserId();
  await assertAccount(userId, input.accountId);

  let createdCount = 0;
  let skippedCount = 0;

  for (const row of input.rows) {
    try {
      await createTransaction(
        {
          date: row.date,
          description: row.description,
          amountCents: Math.abs(row.amountCents),
          type: row.amountCents >= 0 ? "INCOME" : "EXPENSE",
          accountId: input.accountId,
          categoryId: row.categoryId,
          tagIds: [],
          notes: null,
        },
        { provider: input.sourceId, externalId: row.externalId },
      );
      createdCount += 1;
    } catch (error) {
      // A chave única de (provider, externalId) é a última linha de defesa: se a mesma
      // importação foi confirmada duas vezes, a segunda não duplica nada.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        skippedCount += 1;
        continue;
      }
      throw error;
    }
  }

  return { createdCount, skippedCount };
}

async function assertAccount(userId: string, accountId: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true },
  });

  if (!account) {
    throw new ImportServiceError("ACCOUNT_NOT_FOUND", "Conta não encontrada.");
  }
}
