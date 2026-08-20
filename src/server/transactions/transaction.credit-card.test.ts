import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { listAccounts } from "@/server/accounts/account.service";
import { consolidateBalances } from "@/server/accounts/account.balance";
import {
  createTransaction,
  createTransfer,
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
    await purchase("2026-08-20");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });

  it("move compra um dia depois do fechamento para a fatura seguinte", async () => {
    await purchase("2026-08-21");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });

  it("encaixa fechamento 31 no último dia de fevereiro", async () => {
    await purchase("2026-02-28", 1000, 1, secondCardId);
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.closingDate.toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-02-01T03:00:00.000Z");
  });

  it("pula fatura paga e aloca na próxima aberta", async () => {
    const details = await prisma.creditCardDetails.findUniqueOrThrow({
      where: { accountId: cardId },
    });
    await prisma.invoice.create({
      data: {
        creditCardDetailsId: details.id,
        referenceMonth: new Date("2026-08-01T03:00:00.000Z"),
        closingDate: new Date("2026-08-20T03:00:00.000Z"),
        dueDate: new Date("2026-08-28T03:00:00.000Z"),
        status: "PAID",
        paidAt: new Date("2026-08-28T03:00:00.000Z"),
      },
    });
    await purchase("2026-08-10");
    const transaction = await prisma.transaction.findFirstOrThrow({ include: { invoice: true } });
    expect(transaction.invoice?.referenceMonth.toISOString()).toBe("2026-09-01T03:00:00.000Z");
  });
});

describe("parcelamento", () => {
  it("divide R$ 100,00 em 3x sem perder um centavo", async () => {
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
    await purchase("2026-08-10", 120_000, 12);
    const listing = await listAccounts();
    const card = listing.accounts.find((account) => account.id === cardId)?.creditCard;
    expect(card?.availableLimitCents).toBe(880_000);
  });
});

describe("pagamento de fatura", () => {
  it("impede editar parcela que já pertence a fatura paga", async () => {
    const transactionId = await purchase("2026-08-10", 10_000, 2);
    const transaction = await prisma.transaction.findUniqueOrThrow({
      where: { id: transactionId },
      select: { invoiceId: true },
    });
    await prisma.invoice.update({
      where: { id: transaction.invoiceId! },
      data: { status: "PAID" },
    });

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
    ).rejects.toMatchObject({ code: "PAID_INVOICE_IMMUTABLE" });
  });

  it("reduz a dívida do cartão sem criar nova despesa", async () => {
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
});
