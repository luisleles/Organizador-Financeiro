import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { getAccountDetail, listAccounts } from "@/server/accounts/account.service";
import { consolidateBalances } from "@/server/accounts/account.balance";
import {
  createTransaction,
  createTransfer,
  deleteTransactions,
  payInvoice,
  updateTransaction,
} from "./transaction.service";

let checkingId: string;
let cardId: string;
let secondCardId: string;

beforeAll(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { name: "Cartão", email: "cartao@example.com", passwordHash: "x" },
  });
  const checking = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Corrente",
      type: "CHECKING",
      class: "ASSET",
      initialBalanceCents: 500_000,
      color: "#0B6E75",
      icon: "landmark",
    },
  });
  const card = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Cartão",
      type: "CREDIT_CARD",
      class: "LIABILITY",
      initialBalanceCents: 0,
      color: "#B0234A",
      icon: "credit-card",
      creditCardDetails: {
        create: { closingDay: 20, dueDay: 28, creditLimitCents: 1_000_000 },
      },
    },
  });
  const secondCard = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Segundo cartão",
      type: "CREDIT_CARD",
      class: "LIABILITY",
      initialBalanceCents: 0,
      color: "#2653D9",
      icon: "credit-card",
      creditCardDetails: {
        create: { closingDay: 31, dueDay: 10, creditLimitCents: 500_000 },
      },
    },
  });
  checkingId = checking.id;
  cardId = card.id;
  secondCardId = secondCard.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Congela "agora" no instante em que a alocação decide se a fatura ainda aceita lançamento. */
function freeze(isoInstant: string): void {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoInstant));
}

function purchase(date: string, amountCents = 10_000, installments = 1, accountId = cardId) {
  return createTransaction({
    date,
    description: "Compra",
    amountCents,
    type: "EXPENSE",
    accountId,
    categoryId: null,
    tagIds: [],
    notes: null,
    installments,
    installmentScope: "SINGLE",
  });
}

/** Fatura marcada como paga sem nenhum lançamento além disso: `paidAt` já basta. */
async function createPaidOpenInvoice(closingDate: string, dueDate: string, paidAt: string) {
  const details = await prisma.creditCardDetails.findUniqueOrThrow({
    where: { accountId: cardId },
  });
  return prisma.invoice.create({
    data: {
      creditCardDetailsId: details.id,
      referenceMonth: new Date(`${closingDate.slice(0, 7)}-01T03:00:00.000Z`),
      closingDate: new Date(closingDate),
      dueDate: new Date(dueDate),
      paidAt: new Date(paidAt),
    },
  });
}

describe("guardas de transferência", () => {
  it("rejeita cartão como origem", async () => {
    await expect(
      createTransfer({
        date: "2026-08-10",
        description: "Inválida",
        amountCents: 1000,
        fromAccountId: cardId,
        toAccountId: checkingId,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_CARD_AS_SOURCE" });
  });

  it("rejeita transferência entre dois cartões", async () => {
    await expect(
      createTransfer({
        date: "2026-08-10",
        description: "Inválida",
        amountCents: 1000,
        fromAccountId: cardId,
        toAccountId: secondCardId,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "CREDIT_CARD_AS_SOURCE" });
  });
});

describe("alocação em fatura", () => {
  it("inclui compra do dia exato do fechamento no mês corrente", async () => {
    freeze("2026-08-20T12:00:00Z");
    await purchase("2026-08-20");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("move compra um dia depois do fechamento para a fatura seguinte", async () => {
    freeze("2026-08-21T12:00:00Z");
    await purchase("2026-08-21");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  it("encaixa fechamento 31 no último dia de fevereiro", async () => {
    freeze("2026-02-28T12:00:00Z");
    await purchase("2026-02-28", 1000, 1, secondCardId);
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.closingDate.toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-02-01T03:00:00.000Z");
  });

  it("compra hoje, com fatura corrente paga e ainda aberta, aloca na fatura corrente", async () => {
    freeze("2026-08-10T12:00:00Z");
    await createPaidOpenInvoice(
      "2026-08-20T03:00:00.000Z",
      "2026-08-28T03:00:00.000Z",
      "2026-08-05T03:00:00.000Z",
    );

    await purchase("2026-08-10");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("compra após o fechamento aloca na próxima, independente do status de pagamento", async () => {
    freeze("2026-08-25T12:00:00Z");
    await createPaidOpenInvoice(
      "2026-08-20T03:00:00.000Z",
      "2026-08-28T03:00:00.000Z",
      "2026-08-05T03:00:00.000Z",
    );

    await purchase("2026-08-25");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  it("fatura fechada e paga não aceita lançamento novo, mesmo com data dentro do ciclo dela", async () => {
    // "Hoje" já passou do fechamento de agosto: um lançamento atrasado, com data de agosto,
    // não pode reabrir essa fatura — só a data em relação ao fechamento não basta.
    freeze("2026-08-25T12:00:00Z");
    await createPaidOpenInvoice(
      "2026-08-20T03:00:00.000Z",
      "2026-08-28T03:00:00.000Z",
      "2026-08-05T03:00:00.000Z",
    );

    await purchase("2026-08-15");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });
});

describe("parcelamento", () => {
  it("divide R$ 100,00 em 3x sem perder um centavo", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 10_000, 3);
    const installments = await prisma.transaction.findMany({
      orderBy: { installmentNumber: "asc" },
    });
    expect(installments.map((entry) => entry.amountCents)).toEqual([-3334, -3333, -3333]);
    expect(installments.reduce((total, entry) => total + Math.abs(entry.amountCents), 0)).toBe(
      10_000,
    );
  });

  it("distribui 12 parcelas em faturas consecutivas atravessando o ano", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 12_000, 12);
    const installments = await prisma.transaction.findMany({
      orderBy: { installmentNumber: "asc" },
      include: { invoice: { select: { referenceMonth: true } } },
    });
    expect(installments.map((entry) => entry.invoice?.referenceMonth.toISOString())).toEqual([
      "2026-08-01T03:00:00.000Z",
      "2026-09-01T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
      "2026-11-01T03:00:00.000Z",
      "2026-12-01T03:00:00.000Z",
      "2027-01-01T03:00:00.000Z",
      "2027-02-01T03:00:00.000Z",
      "2027-03-01T03:00:00.000Z",
      "2027-04-01T03:00:00.000Z",
      "2027-05-01T03:00:00.000Z",
      "2027-06-01T03:00:00.000Z",
      "2027-07-01T03:00:00.000Z",
    ]);
  });

  it("bloqueia no limite todas as parcelas futuras desde a compra", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 120_000, 12);
    const listing = await listAccounts();
    const card = listing.accounts.find((account) => account.id === cardId)?.creditCard;
    expect(card?.availableLimitCents).toBe(880_000);
  });

  it("parcelamento iniciado em fatura paga e aberta começa nela, não na seguinte", async () => {
    freeze("2026-08-10T12:00:00Z");
    await createPaidOpenInvoice(
      "2026-08-20T03:00:00.000Z",
      "2026-08-28T03:00:00.000Z",
      "2026-08-05T03:00:00.000Z",
    );

    await purchase("2026-08-10", 30_000, 3);
    const installments = await prisma.transaction.findMany({
      orderBy: { installmentNumber: "asc" },
      include: { invoice: { select: { referenceMonth: true } } },
    });
    expect(installments.map((entry) => entry.invoice?.referenceMonth.toISOString())).toEqual([
      "2026-08-01T03:00:00.000Z",
      "2026-09-01T03:00:00.000Z",
      "2026-10-01T03:00:00.000Z",
    ]);
  });
});

describe("trava de edição por fechamento", () => {
  it("editar parcela em fatura paga e ABERTA é permitido", async () => {
    freeze("2026-08-10T12:00:00Z");
    const transactionId = await purchase("2026-08-10", 10_000);
    const invoiceId = (
      await prisma.transaction.findUniqueOrThrow({
        where: { id: transactionId },
        select: { invoiceId: true },
      })
    ).invoiceId!;
    await payInvoice(invoiceId, checkingId, 10_000, new Date("2026-08-11T03:00:00.000Z"));

    await expect(
      updateTransaction(transactionId, {
        date: "2026-08-10",
        description: "Compra editada",
        amountCents: 5000,
        type: "EXPENSE",
        accountId: cardId,
        categoryId: null,
        tagIds: [],
        notes: null,
        installments: 1,
        installmentScope: "SINGLE",
      }),
    ).resolves.toBeUndefined();
  });

  it("editar parcela em fatura FECHADA continua bloqueado", async () => {
    freeze("2026-08-10T12:00:00Z");
    const transactionId = await purchase("2026-08-10", 10_000);

    freeze("2026-08-25T12:00:00Z");
    await expect(
      updateTransaction(transactionId, {
        date: "2026-08-10",
        description: "Compra editada",
        amountCents: 5000,
        type: "EXPENSE",
        accountId: cardId,
        categoryId: null,
        tagIds: [],
        notes: null,
        installments: 1,
        installmentScope: "SINGLE",
      }),
    ).rejects.toMatchObject({ code: "CLOSED_INVOICE_IMMUTABLE" });
  });

  it("excluir parcela em fatura FECHADA continua bloqueado", async () => {
    freeze("2026-08-10T12:00:00Z");
    const transactionId = await purchase("2026-08-10", 10_000);

    freeze("2026-08-25T12:00:00Z");
    await expect(deleteTransactions([transactionId])).rejects.toMatchObject({
      code: "CLOSED_INVOICE_IMMUTABLE",
    });
  });
});

describe("pagamento de fatura", () => {
  it("reduz a dívida do cartão sem criar nova despesa", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 120_000);
    const invoice = await prisma.invoice.findFirstOrThrow();
    const before = await listAccounts();
    const cardBefore = before.accounts.find((account) => account.id === cardId)!;

    await payInvoice(invoice.id, checkingId, 120_000, new Date("2026-08-28T03:00:00.000Z"));

    const after = await listAccounts();
    const cardAfter = after.accounts.find((account) => account.id === cardId)!;
    const paymentExpenses = await prisma.transaction.count({
      where: { transferGroupId: { not: null }, type: "EXPENSE" },
    });
    expect(cardAfter.balanceCents).toBe(cardBefore.balanceCents + 120_000);
    expect(paymentExpenses).toBe(0);
    expect(after.consolidated.netCents).toBe(before.consolidated.netCents);
  });

  it("nunca soma limite disponível ao consolidado", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 120_000);
    const listing = await listAccounts();
    const card = listing.accounts.find((account) => account.id === cardId)!;
    const checking = listing.accounts.find((account) => account.id === checkingId)!;
    const explicit = consolidateBalances([
      { balanceCents: checking.balanceCents, isCreditCard: false },
      { balanceCents: card.balanceCents, isCreditCard: true },
    ]);
    expect(listing.consolidated.netCents).toBe(explicit.netCents);
    expect(listing.consolidated.netCents).not.toBe(
      checking.balanceCents + card.creditCard!.availableLimitCents,
    );
  });

  it("lançamento em fatura paga e aberta muda o pagamento para PARTIALLY_PAID sem desfazer o pagamento original", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 10_000);
    const invoice = await prisma.invoice.findFirstOrThrow();
    const paymentDate = new Date("2026-08-12T03:00:00.000Z");
    await payInvoice(invoice.id, checkingId, 10_000, paymentDate);

    await purchase("2026-08-15", 3_400);

    const detail = await getAccountDetail(cardId);
    const found = detail!.invoices!.find((item) => item.id === invoice.id)!;
    expect(found.paymentStatus).toBe("PARTIALLY_PAID");
    expect(found.paidAt?.toISOString()).toBe(paymentDate.toISOString());
    expect(found.totalCents).toBe(-3_400);
  });

  it("pagamento acima do total marca OVERPAID e registra o crédito", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 10_000);
    const invoice = await prisma.invoice.findFirstOrThrow();
    await payInvoice(invoice.id, checkingId, 10_000, new Date("2026-08-12T03:00:00.000Z"));

    // Um estorno depois do pagamento devolve dinheiro à fatura já paga: o saldo vira crédito.
    await createTransaction({
      date: "2026-08-14",
      description: "Estorno",
      amountCents: 3_000,
      type: "INCOME",
      accountId: cardId,
      categoryId: null,
      tagIds: [],
      notes: null,
      installments: 1,
      installmentScope: "SINGLE",
    });

    const detail = await getAccountDetail(cardId);
    const found = detail!.invoices!.find((item) => item.id === invoice.id)!;
    expect(found.paymentStatus).toBe("OVERPAID");
    expect(found.totalCents).toBe(3_000);
  });

  it("limite disponível recalcula corretamente com fatura paga e com fatura fechada", async () => {
    freeze("2026-08-10T12:00:00Z");
    await purchase("2026-08-10", 10_000);
    const invoice = await prisma.invoice.findFirstOrThrow();
    await payInvoice(invoice.id, checkingId, 10_000, new Date("2026-08-12T03:00:00.000Z"));

    const paidOpen = await listAccounts();
    const cardPaidOpen = paidOpen.accounts.find((account) => account.id === cardId)!.creditCard!;
    expect(cardPaidOpen.availableLimitCents).toBe(1_000_000);

    await purchase("2026-08-15", 4_000);
    const paidWithNewDebt = await listAccounts();
    const cardWithNewDebt = paidWithNewDebt.accounts.find(
      (account) => account.id === cardId,
    )!.creditCard!;
    expect(cardWithNewDebt.availableLimitCents).toBe(996_000);

    freeze("2026-08-25T12:00:00Z");
    const closed = await listAccounts();
    const cardClosed = closed.accounts.find((account) => account.id === cardId)!.creditCard!;
    expect(cardClosed.availableLimitCents).toBe(996_000);
  });
});
