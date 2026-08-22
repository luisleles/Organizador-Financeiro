import type { AccountClass, AccountType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import { isBucket, splitParentBalance } from "./account.buckets";
import {
  accountBalanceCents,
  buildBalanceSeries,
  consolidateBalances,
  openingBalanceCents,
} from "./account.balance";
import {
  invoiceCycleStatus,
  invoicePaymentStatus,
  invoiceScheduleForPurchase,
} from "./account.credit-card";
import type { AccountInput } from "./account.schema";
import type {
  AccountDetail,
  AccountEntry,
  AccountInvoice,
  AccountListing,
  AccountSummary,
  CreditCardStatus,
} from "./account.types";

export type AccountErrorCode =
  "NOT_FOUND" | "HAS_TRANSACTIONS" | "INVALID_TYPE_CHANGE" | "HAS_BUCKETS";

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

const ACCOUNT_WITH_CARD = {
  creditCardDetails: {
    include: {
      invoices: {
        orderBy: { referenceMonth: "desc" },
        include: {
          transactions: {
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            select: {
              id: true,
              date: true,
              description: true,
              amountCents: true,
              type: true,
              installmentNumber: true,
              installmentTotal: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.AccountInclude;

type AccountWithCard = Prisma.AccountGetPayload<{ include: typeof ACCOUNT_WITH_CARD }>;

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
      include: ACCOUNT_WITH_CARD,
    }),
    aggregateTotals(userId),
  ]);

  const summaries = accounts.map((account) => toSummary(account, totalsByAccount.get(account.id)));
  const byParent = new Map<string, AccountSummary[]>();
  for (const summary of summaries) {
    if (!summary.parentAccountId) continue;
    byParent.set(summary.parentAccountId, [
      ...(byParent.get(summary.parentAccountId) ?? []),
      summary,
    ]);
  }

  // Caixinha nunca é conta de primeiro nível: ela aparece aninhada na mãe.
  const topLevel = summaries
    .filter((summary) => !summary.isBucket)
    .map((summary) => {
      const buckets = byParent.get(summary.id) ?? [];
      const split = splitParentBalance(
        summary.balanceCents,
        buckets.map((bucket) => bucket.balanceCents),
      );

      return {
        ...summary,
        buckets,
        availableBalanceCents: split.availableCents,
        totalBalanceCents: split.totalCents,
      };
    });

  const activeSummaries = summaries.filter((summary) => !summary.archived);

  return {
    accounts: topLevel,
    // Consolida cada conta uma vez só — a mãe pelo saldo próprio, a caixinha pelo dela.
    consolidated: consolidateBalances(
      activeSummaries.map((summary) => ({
        balanceCents: summary.balanceCents,
        isCreditCard: summary.class === "LIABILITY",
      })),
    ),
    // Soma o que cada cartão ativo já lançou na fatura em aberto, não a dívida total do
    // cartão — por isso não sai de `consolidateBalances`, que olha só o saldo acumulado.
    dueAtNextClosingCents: activeSummaries.reduce(
      (total, summary) => total + Math.abs(summary.creditCard?.currentDebtCents ?? 0),
      0,
    ),
  };
}

export async function getAccountDetail(
  accountId: string,
  options: { entryLimit?: number } = {},
): Promise<AccountDetail | null> {
  const userId = await requireUserId();
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    include: ACCOUNT_WITH_CARD,
  });
  if (!account) return null;

  const totals = await prisma.transaction.aggregate({
    where: { accountId, userId },
    _sum: { amountCents: true },
    _count: { _all: true },
  });
  const summary = toSummary(account, {
    movementCents: totals._sum.amountCents ?? 0,
    transactionCount: totals._count._all,
  });

  if (account.creditCardDetails) {
    const invoices = account.creditCardDetails.invoices.map(toInvoice);
    const entries = invoices.flatMap((invoice) => invoice.entries);
    const ascending = [...entries].sort(
      (left, right) => left.date.getTime() - right.date.getTime(),
    );
    return {
      account: summary,
      entries,
      invoices,
      balanceSeries: buildBalanceSeries(
        openingBalanceCents(summary.balanceCents, ascending),
        ascending,
      ),
    };
  }

  const transactions = await prisma.transaction.findMany({
    where: { accountId, userId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: options.entryLimit ?? DEFAULT_ENTRY_LIMIT,
    select: {
      id: true,
      date: true,
      description: true,
      amountCents: true,
      type: true,
      installmentNumber: true,
      installmentTotal: true,
      category: { select: { name: true } },
    },
  });
  const entries = transactions.map(toEntry);
  const ascending = [...entries].reverse();
  return {
    account: summary,
    entries,
    invoices: null,
    balanceSeries: buildBalanceSeries(
      openingBalanceCents(summary.balanceCents, ascending),
      ascending,
    ),
  };
}

export async function listAssetAccountOptions(): Promise<
  { id: string; name: string; color: string }[]
> {
  const userId = await requireUserId();
  return prisma.account.findMany({
    where: { userId, class: "ASSET", archived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

export async function createAccount(input: AccountInput): Promise<string> {
  const userId = await requireUserId();
  return prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        userId,
        ...toAccountFields(input),
        ...(input.type === "CREDIT_CARD"
          ? { creditCardDetails: { create: toCardFields(input) } }
          : {}),
      },
      select: { id: true },
    });
    return account.id;
  });
}

export async function updateAccount(accountId: string, input: AccountInput): Promise<void> {
  const userId = await requireUserId();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({
      where: { id: accountId, userId },
      include: { creditCardDetails: { select: { id: true } } },
    });
    if (!existing) throw notFound();

    if (existing.type !== input.type) {
      const transactionCount = await tx.transaction.count({ where: { accountId, userId } });
      if (transactionCount > 0) {
        throw new AccountServiceError(
          "INVALID_TYPE_CHANGE",
          "Uma conta com lançamentos não pode mudar de ou para cartão de crédito.",
        );
      }
    }

    await tx.account.update({ where: { id: accountId }, data: toAccountFields(input) });
    if (input.type === "CREDIT_CARD") {
      await tx.creditCardDetails.upsert({
        where: { accountId },
        create: { accountId, ...toCardFields(input) },
        update: toCardFields(input),
      });
    } else if (existing.creditCardDetails) {
      await tx.creditCardDetails.delete({ where: { accountId } });
    }
  });
}

export async function setAccountArchived(accountId: string, archived: boolean): Promise<void> {
  const userId = await requireUserId();
  const { count } = await prisma.account.updateMany({
    where: { id: accountId, userId },
    data: { archived },
  });
  if (count === 0) throw notFound();
}

export async function deleteAccount(accountId: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true },
    });
    if (!account) throw notFound();

    // A cascata do banco levaria as caixinhas junto sem avisar. Caixinha é lastro de uma
    // meta: quem quer sumir com ela resgata pela meta, não apagando a conta mãe.
    const bucketCount = await tx.account.count({ where: { parentAccountId: accountId, userId } });
    if (bucketCount > 0) {
      throw new AccountServiceError(
        "HAS_BUCKETS",
        "Esta conta tem caixinhas de metas. Resgate as metas antes de apagá-la.",
      );
    }

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

function toSummary(account: AccountWithCard, totals?: AccountTotals): AccountSummary {
  const resolved = totals ?? { movementCents: 0, transactionCount: 0 };
  const balanceCents = accountBalanceCents(account.initialBalanceCents, resolved.movementCents);
  return {
    id: account.id,
    name: account.name,
    institution: account.institution,
    type: account.type,
    class: account.class,
    color: account.color,
    icon: account.icon,
    archived: account.archived,
    initialBalanceCents: account.initialBalanceCents,
    balanceCents,
    transactionCount: resolved.transactionCount,
    creditCard: toCreditCardStatus(account, balanceCents),
    parentAccountId: account.parentAccountId,
    isBucket: isBucket(account),
    availableBalanceCents: balanceCents,
    totalBalanceCents: balanceCents,
    buckets: [],
  };
}

function toCreditCardStatus(
  account: AccountWithCard,
  ledgerBalanceCents: number,
): CreditCardStatus | null {
  const details = account.creditCardDetails;
  if (!details) return null;

  const current = invoiceScheduleForPurchase(new Date(), details.closingDay, details.dueDay);
  const currentInvoice = details.invoices.find(
    (invoice) => invoice.referenceMonth.getTime() === current.referenceMonth.getTime(),
  );
  const currentTotal = sumInvoice(currentInvoice?.transactions ?? []);
  // Cada fatura compromete o limite só pelo que ainda deve: uma paga ou paga a mais não
  // tira nem devolve limite, então entra com zero em vez de exigir um status à parte.
  const committedCents = details.invoices.reduce(
    (total, invoice) => total + Math.max(0, -sumInvoice(invoice.transactions)),
    0,
  );
  const availableLimitCents = details.creditLimitCents - committedCents;

  return {
    detailsId: details.id,
    closingDay: details.closingDay,
    dueDay: details.dueDay,
    creditLimitCents: details.creditLimitCents,
    lastFourDigits: details.lastFourDigits,
    brand: details.brand,
    currentDebtCents: Math.min(currentTotal, 0),
    creditBalanceCents: Math.max(ledgerBalanceCents, 0),
    availableLimitCents,
    limitUsagePercent:
      details.creditLimitCents > 0
        ? Math.round((committedCents / details.creditLimitCents) * 10_000) / 100
        : 0,
    closingDate: current.closingDate,
    dueDate: current.dueDate,
    daysUntilClosing: daysBetweenToday(current.closingDate),
  };
}

function toInvoice(
  invoice: NonNullable<AccountWithCard["creditCardDetails"]>["invoices"][number],
): AccountInvoice {
  const totalCents = sumInvoice(invoice.transactions);
  return {
    id: invoice.id,
    referenceMonth: invoice.referenceMonth,
    closingDate: invoice.closingDate,
    dueDate: invoice.dueDate,
    cycleStatus: invoiceCycleStatus(invoice.closingDate),
    paymentStatus: invoicePaymentStatus(totalCents, invoice.paidAt),
    paidAt: invoice.paidAt,
    paymentTransferGroupId: invoice.paymentTransferGroupId,
    totalCents,
    entries: invoice.transactions.map(toEntry),
  };
}

function toEntry(transaction: {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  type: "INCOME" | "EXPENSE" | "TRANSFER";
  installmentNumber: number | null;
  installmentTotal: number | null;
  category: { name: string } | null;
}): AccountEntry {
  return {
    id: transaction.id,
    date: transaction.date,
    description: transaction.description,
    amountCents: transaction.amountCents,
    categoryName: transaction.category?.name ?? null,
    isTransfer: transaction.type === "TRANSFER",
    installmentNumber: transaction.installmentNumber,
    installmentTotal: transaction.installmentTotal,
  };
}

function sumInvoice(entries: readonly { amountCents: number }[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}

function daysBetweenToday(date: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function toAccountFields(input: AccountInput): {
  name: string;
  institution: string | null;
  type: AccountType;
  class: AccountClass;
  initialBalanceCents: number;
  color: string;
  icon: string;
} {
  return {
    name: input.name,
    institution: input.institution,
    type: input.type,
    class: input.type === "CREDIT_CARD" ? "LIABILITY" : "ASSET",
    initialBalanceCents: input.initialBalanceCents,
    color: input.color,
    icon: input.icon,
  };
}

function toCardFields(input: AccountInput): {
  closingDay: number;
  dueDay: number;
  creditLimitCents: number;
  lastFourDigits: string | null;
  brand: string | null;
} {
  if (
    input.type !== "CREDIT_CARD" ||
    input.closingDay === null ||
    input.dueDay === null ||
    input.creditLimitCents === null
  ) {
    throw new AccountServiceError("INVALID_TYPE_CHANGE", "Dados do cartão incompletos.");
  }
  return {
    closingDay: input.closingDay,
    dueDay: input.dueDay,
    creditLimitCents: input.creditLimitCents,
    lastFourDigits: input.lastFourDigits,
    brand: input.brand,
  };
}

function notFound(): AccountServiceError {
  return new AccountServiceError("NOT_FOUND", "Conta não encontrada.");
}
