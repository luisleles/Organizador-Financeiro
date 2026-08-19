import type { Account, AccountType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import {
  accountBalanceCents,
  buildBalanceSeries,
  consolidateBalances,
  openingBalanceCents,
} from "./account.balance";
import { creditCardCycle, creditCardPosition } from "./account.credit-card";
import type { AccountInput } from "./account.schema";
import {
  isCreditCard,
  type AccountDetail,
  type AccountEntry,
  type AccountListing,
  type AccountSummary,
  type CreditCardStatus,
} from "./account.types";

export type AccountErrorCode = "NOT_FOUND" | "HAS_TRANSACTIONS";

export class AccountServiceError extends Error {
  constructor(
    readonly code: AccountErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountServiceError";
  }
}

const DEFAULT_ENTRY_LIMIT = 30;

/** As colunas que create e update gravam em comum — evita duas listas para sair de sincronia. */
type PersistedAccountFields = {
  name: string;
  institution: string | null;
  type: AccountType;
  initialBalanceCents: number;
  color: string;
  icon: string;
  closingDay: number | null;
  dueDay: number | null;
  creditLimitCents: number | null;
};

type AccountTotals = {
  movementCents: number;
  transactionCount: number;
};

export async function listAccounts(
  options: { includeArchived?: boolean } = {},
): Promise<AccountListing> {
  const userId = await requireUserId();

  const [accounts, totalsByAccount] = await Promise.all([
    prisma.account.findMany({
      where: { userId, ...(options.includeArchived ? {} : { archived: false }) },
      orderBy: [{ archived: "asc" }, { name: "asc" }],
    }),
    aggregateTotals(userId),
  ]);

  const summaries = accounts.map((account) => toSummary(account, totalsByAccount.get(account.id)));

  return {
    accounts: summaries,
    consolidated: consolidateBalances(
      summaries
        .filter((summary) => !summary.archived)
        .map((summary) => ({
          balanceCents: summary.balanceCents,
          isCreditCard: isCreditCard(summary),
        })),
    ),
  };
}

export async function getAccountDetail(
  accountId: string,
  options: { entryLimit?: number } = {},
): Promise<AccountDetail | null> {
  const userId = await requireUserId();
  const entryLimit = options.entryLimit ?? DEFAULT_ENTRY_LIMIT;

  const account = await prisma.account.findFirst({ where: { id: accountId, userId } });
  if (!account) return null;

  const [totals, transactions] = await Promise.all([
    prisma.transaction.aggregate({
      where: { accountId, userId },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    prisma.transaction.findMany({
      where: { accountId, userId },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: entryLimit,
      select: {
        id: true,
        date: true,
        description: true,
        amountCents: true,
        type: true,
        category: { select: { name: true } },
      },
    }),
  ]);

  const summary = toSummary(account, {
    movementCents: totals._sum.amountCents ?? 0,
    transactionCount: totals._count._all,
  });

  const entries: AccountEntry[] = transactions.map((transaction) => ({
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    amountCents: transaction.amountCents,
    categoryName: transaction.category?.name ?? null,
    isTransfer: transaction.type === "TRANSFER",
  }));

  // A série é desenhada do mais antigo ao mais recente e precisa terminar no saldo atual,
  // então parte do saldo de abertura do recorte, não do saldo inicial da conta.
  const ascending = [...entries].reverse();
  const balanceSeries = buildBalanceSeries(
    openingBalanceCents(summary.balanceCents, ascending),
    ascending,
  );

  return { account: summary, entries, balanceSeries };
}

export async function createAccount(input: AccountInput): Promise<string> {
  const userId = await requireUserId();

  const account = await prisma.account.create({
    data: { userId, ...toPersistedFields(input) },
    select: { id: true },
  });

  return account.id;
}

export async function updateAccount(accountId: string, input: AccountInput): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: toPersistedFields(input),
  });

  if (count === 0) throw notFound();
}

export async function setAccountArchived(accountId: string, archived: boolean): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archived },
  });

  if (count === 0) throw notFound();
}

/**
 * Exclusão definitiva só para conta sem histórico. A checagem e o delete ficam na mesma
 * transação porque, entre uma e outra, um lançamento poderia ser criado — e o cascade do
 * Prisma apagaria o histórico em silêncio.
 */
export async function deleteAccount(accountId: string): Promise<void> {
  const userId = await requireUserId();

  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) throw notFound();

    const transactionCount = await tx.transaction.count({ where: { accountId, userId } });
    if (transactionCount > 0) {
      throw new AccountServiceError(
        "HAS_TRANSACTIONS",
        "Esta conta tem lançamentos. Arquive-a para preservar o histórico.",
      );
    }

    await tx.account.delete({ where: { id: accountId } });
  });
}

async function aggregateTotals(userId: string): Promise<Map<string, AccountTotals>> {
  const grouped = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { userId },
    _sum: { amountCents: true },
    _count: { _all: true },
  });

  return new Map(
    grouped.map((row) => [
      row.accountId,
      { movementCents: row._sum.amountCents ?? 0, transactionCount: row._count._all },
    ]),
  );
}

function toSummary(account: Account, totals: AccountTotals | undefined): AccountSummary {
  const { movementCents, transactionCount } = totals ?? { movementCents: 0, transactionCount: 0 };
  const balanceCents = accountBalanceCents(account.initialBalanceCents, movementCents);

  return {
    id: account.id,
    name: account.name,
    institution: account.institution,
    type: account.type,
    color: account.color,
    icon: account.icon,
    archived: account.archived,
    initialBalanceCents: account.initialBalanceCents,
    balanceCents,
    transactionCount,
    creditCard: toCreditCardStatus(account, balanceCents),
  };
}

function toCreditCardStatus(account: Account, balanceCents: number): CreditCardStatus | null {
  if (account.type !== "CREDIT_CARD") return null;
  if (account.closingDay === null || account.dueDay === null || account.creditLimitCents === null) {
    return null;
  }

  return {
    closingDay: account.closingDay,
    dueDay: account.dueDay,
    creditLimitCents: account.creditLimitCents,
    ...creditCardPosition(balanceCents, account.creditLimitCents),
    ...creditCardCycle(account.closingDay, account.dueDay),
  };
}

/** Campos de fatura em conta que não é cartão viram `null` em vez de lixo persistido. */
function toPersistedFields(input: AccountInput): PersistedAccountFields {
  const isCreditCard = input.type === "CREDIT_CARD";

  return {
    name: input.name,
    institution: input.institution,
    type: input.type,
    initialBalanceCents: input.initialBalanceCents,
    color: input.color,
    icon: input.icon,
    closingDay: isCreditCard ? input.closingDay : null,
    dueDay: isCreditCard ? input.dueDay : null,
    creditLimitCents: isCreditCard ? input.creditLimitCents : null,
  };
}

function notFound(): AccountServiceError {
  return new AccountServiceError("NOT_FOUND", "Conta não encontrada.");
}
