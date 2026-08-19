import type { Prisma } from "@prisma/client";
import { fromZonedParts, toDateParts } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { requireUserId } from "@/server/current-user";
import { PAGE_SIZE, summarizeEntries, type TransactionFilters } from "./transaction.filters";
import type { TransactionInput, TransferInput } from "./transaction.schema";
import type {
  DescriptionSuggestion,
  FilterOptions,
  TransactionListing,
  TransactionRow,
} from "./transaction.types";

export type TransactionErrorCode = "NOT_FOUND" | "BROKEN_TRANSFER" | "NOT_A_TRANSFER";

export class TransactionServiceError extends Error {
  constructor(
    readonly code: TransactionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TransactionServiceError";
  }
}

const ROW_SELECT = {
  id: true,
  date: true,
  description: true,
  amountCents: true,
  type: true,
  transferGroupId: true,
  notes: true,
  account: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TransactionSelect;

export async function listTransactions(
  period: ResolvedPeriod,
  filters: TransactionFilters,
): Promise<TransactionListing> {
  const userId = await requireUserId();
  const where = toWhere(userId, period, filters);

  const sumOf = (extra: Prisma.TransactionWhereInput) =>
    prisma.transaction.aggregate({ where: { ...where, ...extra }, _sum: { amountCents: true } });

  const [totalCount, rows, income, expense, transferred] = await Promise.all([
    prisma.transaction.count({ where }),
    prisma.transaction.findMany({
      where,
      orderBy: toOrderBy(filters),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: ROW_SELECT,
    }),
    sumOf({ type: { not: "TRANSFER" }, amountCents: { gte: 0 } }),
    sumOf({ type: { not: "TRANSFER" }, amountCents: { lt: 0 } }),
    // Só a perna que entra: somar as duas daria zero, porque elas se anulam.
    sumOf({ type: "TRANSFER", amountCents: { gt: 0 } }),
  ]);

  return {
    rows: rows.map(toRow),
    totalCount,
    pageCount: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
    page: filters.page,
    summary: summarizeEntries([
      { type: "INCOME", amountCents: income._sum.amountCents ?? 0 },
      { type: "EXPENSE", amountCents: expense._sum.amountCents ?? 0 },
      { type: "TRANSFER", amountCents: transferred._sum.amountCents ?? 0 },
    ]),
  };
}

export async function getTransaction(transactionId: string): Promise<TransactionRow | null> {
  const userId = await requireUserId();
  const row = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: ROW_SELECT,
  });

  return row ? toRow(row) : null;
}

export async function createTransaction(input: TransactionInput): Promise<string> {
  const userId = await requireUserId();

  const created = await prisma.transaction.create({
    data: {
      userId,
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: fromISODate(input.date),
      description: input.description,
      amountCents: signedAmount(input.type, input.amountCents),
      type: input.type,
      notes: input.notes,
      provider: "manual",
      tags: { connect: input.tagIds.map((id) => ({ id })) },
    },
    select: { id: true },
  });

  return created.id;
}

export async function updateTransaction(
  transactionId: string,
  input: TransactionInput,
): Promise<void> {
  const userId = await requireUserId();
  const existing = await prisma.transaction.findFirst({
    where: { id: transactionId, userId },
    select: { id: true, transferGroupId: true },
  });

  if (!existing) throw notFound();
  if (existing.transferGroupId) {
    throw new TransactionServiceError(
      "NOT_A_TRANSFER",
      "Esta linha faz parte de uma transferência. Edite pela tela de transferência.",
    );
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      accountId: input.accountId,
      categoryId: input.categoryId,
      date: fromISODate(input.date),
      description: input.description,
      amountCents: signedAmount(input.type, input.amountCents),
      type: input.type,
      notes: input.notes,
      tags: { set: input.tagIds.map((id) => ({ id })) },
    },
  });
}

/**
 * Apagar uma perna de transferência apaga a outra junto: meia transferência deixaria uma
 * conta com dinheiro que não saiu de lugar nenhum.
 */
export async function deleteTransactions(transactionIds: readonly string[]): Promise<number> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const selected = await tx.transaction.findMany({
      where: { id: { in: [...transactionIds] }, userId },
      select: { id: true, transferGroupId: true },
    });

    const groupIds = selected
      .map((row) => row.transferGroupId)
      .filter((groupId): groupId is string => groupId !== null);

    const { count } = await tx.transaction.deleteMany({
      where: {
        userId,
        OR: [
          { id: { in: selected.map((row) => row.id) } },
          ...(groupIds.length > 0 ? [{ transferGroupId: { in: groupIds } }] : []),
        ],
      },
    });

    return count;
  });
}

export async function categorizeTransactions(
  transactionIds: readonly string[],
  categoryId: string,
): Promise<number> {
  const userId = await requireUserId();

  // Transferência não tem categoria por definição, então fica de fora do lote.
  const { count } = await prisma.transaction.updateMany({
    where: { id: { in: [...transactionIds] }, userId, type: { not: "TRANSFER" } },
    data: { categoryId },
  });

  return count;
}

export async function tagTransactions(
  transactionIds: readonly string[],
  tagId: string,
): Promise<number> {
  const userId = await requireUserId();

  const selected = await prisma.transaction.findMany({
    where: { id: { in: [...transactionIds] }, userId },
    select: { id: true },
  });

  await prisma.$transaction(
    selected.map((row) =>
      prisma.transaction.update({
        where: { id: row.id },
        data: { tags: { connect: { id: tagId } } },
      }),
    ),
  );

  return selected.length;
}

export async function createTransfer(input: TransferInput): Promise<string> {
  const userId = await requireUserId();
  const transferGroupId = crypto.randomUUID();
  const date = fromISODate(input.date);

  await prisma.transaction.createMany({
    data: [
      {
        userId,
        accountId: input.fromAccountId,
        date,
        description: input.description,
        amountCents: -input.amountCents,
        type: "TRANSFER",
        transferGroupId,
        notes: input.notes,
        provider: "manual",
      },
      {
        userId,
        accountId: input.toAccountId,
        date,
        description: input.description,
        amountCents: input.amountCents,
        type: "TRANSFER",
        transferGroupId,
        notes: input.notes,
        provider: "manual",
      },
    ],
  });

  return transferGroupId;
}

/** As duas pernas são reescritas na mesma transação de banco: ou muda tudo, ou nada muda. */
export async function updateTransfer(transferGroupId: string, input: TransferInput): Promise<void> {
  const userId = await requireUserId();
  const date = fromISODate(input.date);

  await prisma.$transaction(async (tx) => {
    const legs = await tx.transaction.findMany({
      where: { transferGroupId, userId },
      select: { id: true, amountCents: true },
      orderBy: { amountCents: "asc" },
    });

    if (legs.length === 0) throw notFound();
    if (legs.length !== 2) {
      throw new TransactionServiceError(
        "BROKEN_TRANSFER",
        `Transferência com ${legs.length} lançamentos em vez de 2.`,
      );
    }

    const [outgoing, incoming] = legs;
    const shared = {
      date,
      description: input.description,
      type: "TRANSFER" as const,
      notes: input.notes,
    };

    await tx.transaction.update({
      where: { id: outgoing.id },
      data: { ...shared, accountId: input.fromAccountId, amountCents: -input.amountCents },
    });
    await tx.transaction.update({
      where: { id: incoming.id },
      data: { ...shared, accountId: input.toAccountId, amountCents: input.amountCents },
    });
  });
}

export async function deleteTransfer(transferGroupId: string): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.transaction.deleteMany({ where: { transferGroupId, userId } });
  if (count === 0) throw notFound();
}

export async function getTransfer(transferGroupId: string): Promise<TransferInput | null> {
  const userId = await requireUserId();
  const legs = await prisma.transaction.findMany({
    where: { transferGroupId, userId },
    orderBy: { amountCents: "asc" },
    select: { accountId: true, amountCents: true, date: true, description: true, notes: true },
  });

  if (legs.length !== 2) return null;
  const [outgoing, incoming] = legs;

  return {
    date: toISODate(outgoing.date),
    description: outgoing.description,
    amountCents: Math.abs(outgoing.amountCents),
    fromAccountId: outgoing.accountId,
    toAccountId: incoming.accountId,
    notes: outgoing.notes,
  };
}

export async function listFilterOptions(): Promise<FilterOptions> {
  const userId = await requireUserId();

  const [accounts, categories, tags] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.category.findMany({
      where: { userId, archived: false },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { id: true, name: true, kind: true },
    }),
    prisma.tag.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  return { accounts, categories, tags };
}

/**
 * Uma linha por descrição, com a categoria e a conta da última vez que ela foi usada — é
 * o que o autocomplete precisa para pré-preencher o resto do formulário.
 */
export async function listDescriptionSuggestions(limit = 200): Promise<DescriptionSuggestion[]> {
  const userId = await requireUserId();

  const recent = await prisma.transaction.findMany({
    where: { userId, type: { not: "TRANSFER" } },
    orderBy: { date: "desc" },
    take: limit * 5,
    select: { description: true, categoryId: true, accountId: true, amountCents: true },
  });

  const byDescription = new Map<string, DescriptionSuggestion>();
  for (const row of recent) {
    const key = row.description.toLocaleLowerCase("pt-BR");
    if (byDescription.has(key)) continue;

    byDescription.set(key, {
      description: row.description,
      categoryId: row.categoryId,
      accountId: row.accountId,
      amountCents: Math.abs(row.amountCents),
    });
    if (byDescription.size >= limit) break;
  }

  return [...byDescription.values()];
}

function toWhere(
  userId: string,
  period: ResolvedPeriod,
  filters: TransactionFilters,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {
    userId,
    date: { gte: period.start, lte: period.end },
  };

  if (filters.accountIds.length > 0) where.accountId = { in: filters.accountIds };
  if (filters.categoryIds.length > 0) where.categoryId = { in: filters.categoryIds };
  if (filters.tagIds.length > 0) where.tags = { some: { id: { in: filters.tagIds } } };
  if (filters.type) where.type = filters.type;

  // A faixa de valor é sobre o módulo: quem procura "acima de R$ 200" quer as duas pontas.
  const range = amountRange(filters.minCents, filters.maxCents);
  if (range) where.OR = range;

  if (filters.search) {
    where.AND = [
      {
        OR: [
          { description: { contains: filters.search } },
          { notes: { contains: filters.search } },
        ],
      },
    ];
  }

  return where;
}

function amountRange(
  minCents: number | null,
  maxCents: number | null,
): Prisma.TransactionWhereInput[] | null {
  if (minCents === null && maxCents === null) return null;

  const positive: Prisma.IntFilter = {};
  const negative: Prisma.IntFilter = {};

  if (minCents !== null) {
    positive.gte = minCents;
    negative.lte = -minCents;
  }
  if (maxCents !== null) {
    positive.lte = maxCents;
    negative.gte = -maxCents;
  }

  return [{ amountCents: positive }, { amountCents: negative }];
}

function toOrderBy(filters: TransactionFilters): Prisma.TransactionOrderByWithRelationInput[] {
  return filters.sort === "valor"
    ? [{ amountCents: filters.direction }, { date: "desc" }]
    : [{ date: filters.direction }, { createdAt: filters.direction }];
}

type RawRow = Prisma.TransactionGetPayload<{ select: typeof ROW_SELECT }>;

function toRow(row: RawRow): TransactionRow {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    amountCents: row.amountCents,
    type: row.type,
    accountId: row.account.id,
    accountName: row.account.name,
    accountColor: row.account.color,
    categoryId: row.category?.id ?? null,
    categoryName: row.category?.name ?? null,
    tags: row.tags,
    transferGroupId: row.transferGroupId,
    notes: row.notes,
  };
}

function signedAmount(type: "INCOME" | "EXPENSE", magnitudeCents: number): number {
  return type === "EXPENSE" ? -magnitudeCents : magnitudeCents;
}

function fromISODate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return fromZonedParts({ year, month, day });
}

/** Data no calendário de São Paulo, que é o que o `<input type="date">` espera. */
function toISODate(date: Date): string {
  const { year, month, day } = toDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function notFound(): TransactionServiceError {
  return new TransactionServiceError("NOT_FOUND", "Lançamento não encontrado.");
}
