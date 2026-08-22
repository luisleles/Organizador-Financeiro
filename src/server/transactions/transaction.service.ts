import type { Prisma, TransactionType } from "@prisma/client";
import { fromISODate, toISODate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { BUCKET_RULE_MESSAGES, validateBucketTransfer } from "@/server/accounts/account.buckets";
import { assertOperationAllowed } from "@/server/accounts/account.operations";
import type { ResolvedPeriod } from "@/lib/period";
import { resolveCategoryForDescription } from "@/server/categories/category.service";
import { requireUserId } from "@/server/current-user";
import {
  invoiceScheduleForPurchase,
  isOpenForPosting,
  shiftInvoiceSchedule,
  shiftPurchaseDate,
  splitInstallmentCents,
  type InvoiceSchedule,
} from "@/server/accounts/account.credit-card";
import { PAGE_SIZE, summarizeEntries, type TransactionFilters } from "./transaction.filters";
import type { TransactionInput, TransferInput } from "./transaction.schema";
import type {
  DescriptionSuggestion,
  FilterOptions,
  TransactionListing,
  TransactionRow,
} from "./transaction.types";

export type TransactionErrorCode =
  | "NOT_FOUND"
  | "ACCOUNT_NOT_FOUND"
  | "BROKEN_TRANSFER"
  | "NOT_A_TRANSFER"
  | "CREDIT_CARD_TRANSFER_FORBIDDEN"
  | "CLOSED_INVOICE_IMMUTABLE"
  | "INVOICE_NOT_FOUND"
  | "INVOICE_NOT_PAYABLE"
  | "INVALID_PAYMENT_SOURCE"
  | "PAYMENT_EXCEEDS_INVOICE"
  | "BUCKET_RULE";

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
  invoiceId: true,
  installmentGroupId: true,
  installmentNumber: true,
  installmentTotal: true,
  notes: true,
  account: { select: { id: true, name: true, color: true } },
  category: { select: { id: true, name: true } },
  tags: { select: { id: true, name: true, color: true } },
} satisfies Prisma.TransactionSelect;

type DatabaseClient = Prisma.TransactionClient;

type CardDetails = {
  id: string;
  closingDay: number;
  dueDay: number;
};

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
    // Estorno fica fora dos dois somatórios: é devolução de compra no cartão, não receita,
    // mesmo entrando positivo — a mesma razão que já tira transferência daqui.
    sumOf({ type: { notIn: ["TRANSFER", "REFUND"] }, amountCents: { gte: 0 } }),
    sumOf({ type: { notIn: ["TRANSFER", "REFUND"] }, amountCents: { lt: 0 } }),
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

/**
 * De onde veio o lançamento. O gerador de recorrências grava aqui a chave da ocorrência,
 * e o índice único de `[provider, externalId]` é o que impede a segunda rodada de duplicar.
 */
export type TransactionOrigin = {
  provider: string;
  externalId: string;
};

export async function createTransaction(
  input: TransactionInput,
  origin?: TransactionOrigin,
): Promise<string> {
  const userId = await requireUserId();
  return prisma.$transaction(async (tx) => {
    const account = await findAccount(tx, userId, input.accountId);
    assertOperationAllowed(account, input.type, signedAmount(input.type, input.amountCents));
    const date = fromISODate(input.date);
    // Estorno não parcela: é a devolução de um valor já lançado, não uma compra nova.
    const installmentCount = input.type === "REFUND" ? 1 : (input.installments ?? 1);

    // Regra de categorização entra aqui, e só quando o usuário não escolheu categoria.
    // O import de extrato vai passar pelo mesmo ponto.
    const categorized: TransactionInput = {
      ...input,
      categoryId: await resolveCategoryForDescription(
        tx,
        userId,
        input.description,
        input.categoryId,
      ),
    };

    if (account.class === "ASSET") {
      const created = await tx.transaction.create({
        data: transactionData(
          userId,
          categorized,
          date,
          signedAmount(input.type, input.amountCents),
          null,
          origin,
        ),
        select: { id: true },
      });
      return created.id;
    }

    const details = requireCardDetails(account.creditCardDetails);
    const installmentGroupId = installmentCount > 1 ? crypto.randomUUID() : null;
    const amounts = splitInstallmentCents(input.amountCents, installmentCount);
    let schedule = invoiceScheduleForPurchase(date, details.closingDay, details.dueDay);
    let firstId = "";
    const now = new Date();

    for (let index = 0; index < amounts.length; index += 1) {
      if (index > 0) {
        schedule = shiftInvoiceSchedule(schedule, 1, details.closingDay, details.dueDay);
      }
      const invoice = await ensureOpenInvoice(tx, details, schedule, now);
      schedule = invoice.schedule;
      const number = index + 1;
      const created = await tx.transaction.create({
        data: {
          ...transactionData(
            userId,
            categorized,
            shiftPurchaseDate(date, index),
            signedAmount(input.type, amounts[index]),
            invoice.id,
            origin,
          ),
          description:
            installmentCount > 1
              ? `${input.description} (${number}/${installmentCount})`
              : input.description,
          installmentGroupId,
          installmentNumber: installmentCount > 1 ? number : null,
          installmentTotal: installmentCount > 1 ? installmentCount : null,
        },
        select: { id: true },
      });
      if (index === 0) firstId = created.id;
    }

    return firstId;
  });
}

export async function updateTransaction(
  transactionId: string,
  input: TransactionInput,
): Promise<void> {
  const userId = await requireUserId();
  await prisma.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({
      where: { id: transactionId, userId },
      include: { invoice: { select: { closingDate: true } } },
    });
    if (!existing) throw notFound();
    if (existing.transferGroupId) {
      throw new TransactionServiceError(
        "NOT_A_TRANSFER",
        "Esta linha faz parte de uma transferência e não pode ser editada como lançamento.",
      );
    }
    const now = new Date();
    assertInvoiceOpenForEdit(existing.invoice?.closingDate, now);

    const rows =
      input.installmentScope === "FUTURE" &&
      existing.installmentGroupId &&
      existing.installmentNumber
        ? await tx.transaction.findMany({
            where: {
              userId,
              installmentGroupId: existing.installmentGroupId,
              installmentNumber: { gte: existing.installmentNumber },
            },
            orderBy: { installmentNumber: "asc" },
            include: { invoice: { select: { closingDate: true } } },
          })
        : [existing];

    for (const row of rows) assertInvoiceOpenForEdit(row.invoice?.closingDate, now);

    const account = await findAccount(tx, userId, input.accountId);
    assertOperationAllowed(account, input.type, signedAmount(input.type, input.amountCents));
    const firstDate = fromISODate(input.date);
    let schedule =
      account.creditCardDetails === null
        ? null
        : invoiceScheduleForPurchase(
            firstDate,
            account.creditCardDetails.closingDay,
            account.creditCardDetails.dueDay,
          );

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (index > 0 && schedule && account.creditCardDetails) {
        schedule = shiftInvoiceSchedule(
          schedule,
          1,
          account.creditCardDetails.closingDay,
          account.creditCardDetails.dueDay,
        );
      }
      let invoiceId: string | null = null;
      if (account.class === "LIABILITY") {
        const resolvedInvoice = await ensureOpenInvoice(
          tx,
          requireCardDetails(account.creditCardDetails),
          schedule!,
          now,
        );
        invoiceId = resolvedInvoice.id;
        schedule = resolvedInvoice.schedule;
      }
      const date = index === 0 ? firstDate : shiftPurchaseDate(firstDate, index);
      const description =
        row.installmentNumber && row.installmentTotal
          ? `${input.description} (${row.installmentNumber}/${row.installmentTotal})`
          : input.description;

      await tx.transaction.update({
        where: { id: row.id },
        data: {
          accountId: input.accountId,
          invoiceId,
          categoryId: input.categoryId,
          date,
          description,
          amountCents: signedAmount(input.type, input.amountCents),
          type: input.type,
          notes: input.notes,
          tags: { set: input.tagIds.map((id) => ({ id })) },
        },
      });
    }
  });
}

export async function deleteTransactions(
  transactionIds: readonly string[],
  installmentScope: "SINGLE" | "FUTURE" = "SINGLE",
): Promise<number> {
  const userId = await requireUserId();
  return prisma.$transaction(async (tx) => {
    const selected = await tx.transaction.findMany({
      where: { id: { in: [...transactionIds] }, userId },
      include: { invoice: { select: { closingDate: true } } },
    });
    const now = new Date();
    for (const row of selected) assertInvoiceOpenForEdit(row.invoice?.closingDate, now);

    const ids = new Set(selected.map((row) => row.id));
    if (installmentScope === "FUTURE") {
      for (const row of selected) {
        if (!row.installmentGroupId || !row.installmentNumber) continue;
        const future = await tx.transaction.findMany({
          where: {
            userId,
            installmentGroupId: row.installmentGroupId,
            installmentNumber: { gte: row.installmentNumber },
          },
          include: { invoice: { select: { closingDate: true } } },
        });
        for (const installment of future) {
          assertInvoiceOpenForEdit(installment.invoice?.closingDate, now);
          ids.add(installment.id);
        }
      }
    }

    const groupIds = selected
      .map((row) => row.transferGroupId)
      .filter((groupId): groupId is string => groupId !== null);
    const { count } = await tx.transaction.deleteMany({
      where: {
        userId,
        OR: [
          { id: { in: [...ids] } },
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
  return prisma.$transaction(async (tx) => {
    await validateCommonTransferAccounts(tx, userId, input.fromAccountId, input.toAccountId);
    const transferGroupId = crypto.randomUUID();
    await tx.transaction.createMany({ data: transferLegs(userId, input, transferGroupId) });
    return transferGroupId;
  });
}

export async function updateTransfer(transferGroupId: string, input: TransferInput): Promise<void> {
  const userId = await requireUserId();
  await prisma.$transaction(async (tx) => {
    await validateCommonTransferAccounts(tx, userId, input.fromAccountId, input.toAccountId);
    const legs = await tx.transaction.findMany({
      where: { transferGroupId, userId },
      select: { id: true, amountCents: true, invoiceId: true },
      orderBy: { amountCents: "asc" },
    });
    if (legs.length === 0) throw notFound();
    if (legs.length !== 2) {
      throw new TransactionServiceError(
        "BROKEN_TRANSFER",
        `Transferência com ${legs.length} lançamentos em vez de 2.`,
      );
    }
    if (legs.some((leg) => leg.invoiceId)) {
      throw new TransactionServiceError(
        "CREDIT_CARD_TRANSFER_FORBIDDEN",
        "Pagamento de fatura deve ser alterado pelo fluxo do cartão.",
      );
    }

    const [outgoing, incoming] = legs;
    const date = fromISODate(input.date);
    const shared = {
      date,
      description: input.description,
      type: "TRANSFER" as const,
      notes: input.notes,
    };
    await tx.transaction.update({
      where: { id: outgoing.id },
      data: {
        ...shared,
        accountId: input.fromAccountId,
        amountCents: -input.amountCents,
        invoiceId: null,
      },
    });
    await tx.transaction.update({
      where: { id: incoming.id },
      data: {
        ...shared,
        accountId: input.toAccountId,
        amountCents: input.amountCents,
        invoiceId: null,
      },
    });
  });
}

export async function deleteTransfer(transferGroupId: string): Promise<void> {
  const userId = await requireUserId();
  const invoiceLeg = await prisma.transaction.findFirst({
    where: { transferGroupId, userId, invoiceId: { not: null } },
    select: { id: true },
  });
  if (invoiceLeg) {
    throw new TransactionServiceError(
      "CREDIT_CARD_TRANSFER_FORBIDDEN",
      "Pagamento de fatura deve ser gerenciado pelo fluxo do cartão.",
    );
  }
  const { count } = await prisma.transaction.deleteMany({ where: { transferGroupId, userId } });
  if (count === 0) throw notFound();
}

export async function getTransfer(transferGroupId: string): Promise<TransferInput | null> {
  const userId = await requireUserId();
  const legs = await prisma.transaction.findMany({
    where: { transferGroupId, userId, invoiceId: null },
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

export async function payInvoice(
  invoiceId: string,
  fromAccountId: string,
  amountCents: number,
  date: Date,
): Promise<string> {
  const userId = await requireUserId();
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new TransactionServiceError(
      "INVOICE_NOT_PAYABLE",
      "Informe um valor de pagamento válido.",
    );
  }

  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, creditCardDetails: { account: { userId } } },
      include: {
        creditCardDetails: { include: { account: { select: { id: true, name: true } } } },
        transactions: { select: { amountCents: true } },
      },
    });
    if (!invoice) {
      throw new TransactionServiceError("INVOICE_NOT_FOUND", "Fatura não encontrada.");
    }

    const source = await findAccount(tx, userId, fromAccountId);
    if (source.class === "LIABILITY") {
      throw new TransactionServiceError(
        "INVALID_PAYMENT_SOURCE",
        "O pagamento da fatura precisa sair de uma conta de ativo.",
      );
    }

    // A perna que cai no cartão é a única transferência que ele aceita — e só porque o
    // contexto diz explicitamente que é esta função quem está criando, não um lançamento
    // avulso do usuário.
    assertOperationAllowed(
      {
        id: invoice.creditCardDetails.account.id,
        type: "CREDIT_CARD",
        class: "LIABILITY",
        parentAccountId: null,
      },
      "TRANSFER",
      amountCents,
      "PAY_INVOICE",
    );

    const outstandingCents = Math.max(
      0,
      -invoice.transactions.reduce((total, entry) => total + entry.amountCents, 0),
    );
    if (outstandingCents === 0) {
      throw new TransactionServiceError(
        "INVOICE_NOT_PAYABLE",
        "Esta fatura não tem valor em aberto.",
      );
    }
    if (amountCents > outstandingCents) {
      throw new TransactionServiceError(
        "PAYMENT_EXCEEDS_INVOICE",
        "O pagamento não pode ultrapassar o valor em aberto.",
      );
    }

    const transferGroupId = crypto.randomUUID();
    const description = `Pagamento de fatura · ${invoice.creditCardDetails.account.name}`;
    await tx.transaction.createMany({
      data: [
        {
          userId,
          accountId: source.id,
          date,
          description,
          amountCents: -amountCents,
          type: "TRANSFER",
          transferGroupId,
          provider: "manual",
        },
        {
          userId,
          accountId: invoice.creditCardDetails.account.id,
          invoiceId: invoice.id,
          categoryId: null,
          date,
          description,
          amountCents,
          type: "TRANSFER",
          transferGroupId,
          provider: "manual",
        },
      ],
    });

    // `paidAt` só avança quando este pagamento zera o saldo em aberto: um pagamento parcial
    // não apaga a marca de uma fatura que já foi paga por inteiro antes, porque foi essa
    // marca que passou a valer quando um lançamento novo chegou depois do pagamento.
    const settles = amountCents === outstandingCents;
    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        ...(settles ? { paidAt: date } : {}),
        paymentTransferGroupId: transferGroupId,
      },
    });
    return transferGroupId;
  });
}

export type RefundResult = {
  id: string;
  /** Aviso não bloqueante: presente quando a compra vinculada ainda tem parcelas futuras. */
  installmentNotice: string | null;
};

/**
 * Estorno: entrada de dinheiro dentro do cartão, nunca receita. `type: "REFUND"` — e não
 * `INCOME` — é o que garante que este lançamento nunca aparece como receita em relatório
 * nenhum, mesmo sendo um valor positivo que reduz a fatura e libera limite. A alocação de
 * fatura usa a mesma regra de fechamento de uma compra normal.
 */
export async function registerRefund(
  accountId: string,
  amountCents: number,
  date: Date,
  description: string,
  originalTransactionId?: string | null,
): Promise<RefundResult> {
  const userId = await requireUserId();
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new TransactionServiceError("INVOICE_NOT_PAYABLE", "Informe um valor de estorno válido.");
  }

  return prisma.$transaction(async (tx) => {
    const account = await findAccount(tx, userId, accountId);
    assertOperationAllowed(account, "REFUND", amountCents);
    const details = requireCardDetails(account.creditCardDetails);

    // O vínculo é só para rastreabilidade: não reabre nem altera as parcelas restantes de
    // uma compra parcelada, que continuam existindo e precisam da edição de parcelamento.
    let installmentNotice: string | null = null;
    if (originalTransactionId) {
      const original = await tx.transaction.findFirst({
        where: { id: originalTransactionId, userId, accountId },
        select: { installmentTotal: true },
      });
      if (!original) {
        throw new TransactionServiceError(
          "NOT_FOUND",
          "Compra original não encontrada nesta conta.",
        );
      }
      if (original.installmentTotal && original.installmentTotal > 1) {
        installmentNotice =
          "O vínculo com a compra original é só informativo: as parcelas restantes continuam existindo e precisam ser tratadas pela edição de parcelamento.";
      }
    }

    const schedule = invoiceScheduleForPurchase(date, details.closingDay, details.dueDay);
    const invoice = await ensureOpenInvoice(tx, details, schedule, new Date());

    const created = await tx.transaction.create({
      data: {
        user: { connect: { id: userId } },
        account: { connect: { id: account.id } },
        invoice: { connect: { id: invoice.id } },
        date,
        description,
        amountCents,
        type: "REFUND",
        provider: "manual",
        refundOfId: originalTransactionId ?? null,
      },
      select: { id: true },
    });

    return { id: created.id, installmentNotice };
  });
}

export async function listFilterOptions(): Promise<FilterOptions> {
  const userId = await requireUserId();
  const [accounts, categories, tags] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, type: true, class: true },
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

  return {
    accounts,
    transferAccounts: accounts
      .filter((account) => account.class === "ASSET")
      .map(({ id, name, color }) => ({ id, name, color })),
    categories,
    tags,
  };
}

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

async function validateCommonTransferAccounts(
  tx: DatabaseClient,
  userId: string,
  fromAccountId: string,
  toAccountId: string,
): Promise<void> {
  const [source, destination] = await Promise.all([
    findAccount(tx, userId, fromAccountId),
    findAccount(tx, userId, toAccountId),
  ]);
  // Transferência avulsa não tem exceção: quem move dinheiro para dentro ou para fora de
  // um cartão por esse caminho é sempre rejeitado. A única perna de cartão sancionada é a
  // que `payInvoice` cria, com o contexto `PAY_INVOICE` — nunca esta função.
  assertOperationAllowed(source, "TRANSFER", -1);
  assertOperationAllowed(destination, "TRANSFER", 1);

  // Caixinha só conversa com a própria conta mãe — nunca com outra conta, outra caixinha
  // ou cartão. As regras vivem em `account.buckets.ts` e são usadas também na criação.
  const violation = validateBucketTransfer(source, destination);
  if (violation) {
    throw new TransactionServiceError("BUCKET_RULE", BUCKET_RULE_MESSAGES[violation]);
  }
}

async function findAccount(tx: DatabaseClient, userId: string, accountId: string) {
  const account = await tx.account.findFirst({
    where: { id: accountId, userId },
    include: {
      creditCardDetails: { select: { id: true, closingDay: true, dueDay: true } },
    },
  });
  if (!account) {
    throw new TransactionServiceError("ACCOUNT_NOT_FOUND", "Conta não encontrada.");
  }
  return account;
}

function requireCardDetails(details: CardDetails | null): CardDetails {
  if (!details) {
    throw new TransactionServiceError(
      "ACCOUNT_NOT_FOUND",
      "O cartão não possui os detalhes obrigatórios.",
    );
  }
  return details;
}

/**
 * Em qual fatura um lançamento cai: a que fecha na data da compra, desde que ainda esteja
 * aberta agora — nunca a próxima só porque essa já foi paga. Pagamento antecipado não muda
 * de fatura o que entra depois; só o fechamento faz isso. `now` é capturado uma vez por
 * chamada de `createTransaction`/`updateTransaction` para que todas as parcelas de uma
 * mesma compra sejam avaliadas contra o mesmo instante.
 */
async function ensureOpenInvoice(
  tx: DatabaseClient,
  details: CardDetails,
  initialSchedule: InvoiceSchedule,
  now: Date,
): Promise<{ id: string; schedule: InvoiceSchedule }> {
  let schedule = initialSchedule;
  for (let attempts = 0; attempts < 120; attempts += 1) {
    if (isOpenForPosting(schedule.closingDate, now)) {
      const invoice = await tx.invoice.upsert({
        where: {
          creditCardDetailsId_referenceMonth: {
            creditCardDetailsId: details.id,
            referenceMonth: schedule.referenceMonth,
          },
        },
        create: { creditCardDetailsId: details.id, ...schedule },
        update: {},
        select: { id: true },
      });
      return { id: invoice.id, schedule };
    }
    schedule = shiftInvoiceSchedule(schedule, 1, details.closingDay, details.dueDay);
  }
  throw new TransactionServiceError("INVOICE_NOT_PAYABLE", "Não foi encontrada uma fatura aberta.");
}

function transactionData(
  userId: string,
  input: TransactionInput,
  date: Date,
  amountCents: number,
  invoiceId: string | null,
  origin?: TransactionOrigin,
): Prisma.TransactionCreateInput {
  return {
    user: { connect: { id: userId } },
    account: { connect: { id: input.accountId } },
    ...(input.categoryId ? { category: { connect: { id: input.categoryId } } } : {}),
    ...(invoiceId ? { invoice: { connect: { id: invoiceId } } } : {}),
    date,
    description: input.description,
    amountCents,
    type: input.type,
    notes: input.notes,
    provider: origin?.provider ?? "manual",
    externalId: origin?.externalId,
    tags: { connect: input.tagIds.map((id) => ({ id })) },
  };
}

function transferLegs(userId: string, input: TransferInput, transferGroupId: string) {
  const shared = {
    userId,
    date: fromISODate(input.date),
    description: input.description,
    type: "TRANSFER" as const,
    transferGroupId,
    notes: input.notes,
    provider: "manual",
    invoiceId: null,
  };
  return [
    { ...shared, accountId: input.fromAccountId, amountCents: -input.amountCents },
    { ...shared, accountId: input.toAccountId, amountCents: input.amountCents },
  ];
}

/**
 * Trava de edição: o que importa é o fechamento, não o pagamento. Fatura paga e ainda
 * aberta continua aceitando edição e exclusão normalmente — só depois de fechar é que a
 * parcela vira histórico imutável.
 */
function assertInvoiceOpenForEdit(closingDate: Date | undefined, now: Date): void {
  if (closingDate && !isOpenForPosting(closingDate, now)) {
    throw new TransactionServiceError(
      "CLOSED_INVOICE_IMMUTABLE",
      "Parcela de fatura fechada não pode ser editada ou excluída.",
    );
  }
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
    invoiceId: row.invoiceId,
    installmentGroupId: row.installmentGroupId,
    installmentNumber: row.installmentNumber,
    installmentTotal: row.installmentTotal,
    notes: row.notes,
  };
}

/** Só `EXPENSE` sai negativo: receita, transferência e estorno entram positivos. */
function signedAmount(type: TransactionType, magnitudeCents: number): number {
  return type === "EXPENSE" ? -magnitudeCents : magnitudeCents;
}

function notFound(): TransactionServiceError {
  return new TransactionServiceError("NOT_FOUND", "Lançamento não encontrado.");
}
