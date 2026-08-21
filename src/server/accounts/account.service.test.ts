import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTransaction, createTransfer } from "@/server/transactions/transaction.service";
import { listAccounts } from "./account.service";

let userId: string;
let savingsId: string;
let bucketId: string;
let cardId: string;
let secondCardId: string;

beforeAll(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { name: "Patrimônio", email: "patrimonio@example.com", passwordHash: "x" },
  });
  userId = user.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.account.deleteMany();

  // Só entra na mistura para provar que a soma bate com mais de uma conta comum — nenhum
  // teste precisa do id dela.
  await prisma.account.create({
    data: {
      userId,
      name: "Corrente",
      type: "CHECKING",
      class: "ASSET",
      initialBalanceCents: 500_000,
      color: "#0B6E75",
      icon: "landmark",
    },
  });
  const savings = await prisma.account.create({
    data: {
      userId,
      name: "Poupança",
      type: "SAVINGS",
      class: "ASSET",
      initialBalanceCents: 1_000_000,
      color: "#2653D9",
      icon: "piggy-bank",
    },
  });
  const bucket = await prisma.account.create({
    data: {
      userId,
      name: "Caixinha viagem",
      type: "SAVINGS_BUCKET",
      class: "ASSET",
      initialBalanceCents: 0,
      color: "#A85B12",
      icon: "plane",
      parentAccountId: savings.id,
    },
  });
  const card = await prisma.account.create({
    data: {
      userId,
      name: "Cartão A",
      type: "CREDIT_CARD",
      class: "LIABILITY",
      initialBalanceCents: 0,
      color: "#B0234A",
      icon: "credit-card",
      creditCardDetails: { create: { closingDay: 20, dueDay: 28, creditLimitCents: 1_000_000 } },
    },
  });
  const secondCard = await prisma.account.create({
    data: {
      userId,
      name: "Cartão B",
      type: "CREDIT_CARD",
      class: "LIABILITY",
      initialBalanceCents: 0,
      color: "#8A2BE2",
      icon: "credit-card",
      creditCardDetails: { create: { closingDay: 10, dueDay: 20, creditLimitCents: 300_000 } },
    },
  });

  savingsId = savings.id;
  bucketId = bucket.id;
  cardId = card.id;
  secondCardId = secondCard.id;
});

function purchase(accountId: string, date: string, amountCents: number) {
  return createTransaction({
    date,
    description: "Compra",
    amountCents,
    type: "EXPENSE",
    accountId,
    categoryId: null,
    tagIds: [],
    notes: null,
    installments: 1,
    installmentScope: "SINGLE",
  });
}

async function consolidatedOf() {
  return (await listAccounts()).consolidated;
}

describe("assets + liabilities == netWorth", () => {
  it("vale para contas comuns, caixinha e cartão com dívida", async () => {
    await createTransfer({
      date: "2026-08-10",
      description: "Aporte",
      amountCents: 200_000,
      fromAccountId: savingsId,
      toAccountId: bucketId,
      notes: null,
    });
    await purchase(cardId, "2026-08-10", 45_000);

    const consolidated = await consolidatedOf();
    expect(consolidated.assetsBalanceCents + consolidated.liabilitiesBalanceCents).toBe(
      consolidated.netWorthCents,
    );
  });

  it("continua valendo com cartão pago a mais (crédito)", async () => {
    await purchase(cardId, "2026-08-10", 10_000);
    // Estorno maior que a compra: a fatura vira crédito, não dívida.
    await createTransaction({
      date: "2026-08-12",
      description: "Estorno",
      amountCents: 15_000,
      type: "INCOME",
      accountId: cardId,
      categoryId: null,
      tagIds: [],
      notes: null,
      installments: 1,
      installmentScope: "SINGLE",
    });

    const consolidated = await consolidatedOf();
    expect(consolidated.assetsBalanceCents + consolidated.liabilitiesBalanceCents).toBe(
      consolidated.netWorthCents,
    );
    expect(consolidated.liabilitiesBalanceCents).toBe(0);
  });

  it("vale com dois cartões, limites diferentes", async () => {
    await purchase(cardId, "2026-08-10", 45_000);
    await purchase(secondCardId, "2026-08-10", 12_000);

    const consolidated = await consolidatedOf();
    expect(consolidated.assetsBalanceCents + consolidated.liabilitiesBalanceCents).toBe(
      consolidated.netWorthCents,
    );
    expect(consolidated.liabilitiesBalanceCents).toBe(-57_000);
  });
});

describe("caixinha não é contada duas vezes", () => {
  it("aporte para a caixinha não muda o patrimônio, só a composição", async () => {
    const antes = await consolidatedOf();

    await createTransfer({
      date: "2026-08-10",
      description: "Aporte",
      amountCents: 300_000,
      fromAccountId: savingsId,
      toAccountId: bucketId,
      notes: null,
    });

    const depois = await consolidatedOf();
    expect(depois.netWorthCents).toBe(antes.netWorthCents);
    expect(depois.assetsBalanceCents).toBe(antes.assetsBalanceCents);
  });

  it("o total bate com a soma manual de cada conta, sem repetir a caixinha", async () => {
    await createTransfer({
      date: "2026-08-10",
      description: "Aporte",
      amountCents: 300_000,
      fromAccountId: savingsId,
      toAccountId: bucketId,
      notes: null,
    });

    const accounts = await prisma.account.findMany({
      select: { id: true, initialBalanceCents: true },
    });
    const movements = await prisma.transaction.groupBy({
      by: ["accountId"],
      _sum: { amountCents: true },
    });
    const movementById = new Map(
      movements.map((row) => [row.accountId, row._sum.amountCents ?? 0]),
    );
    const manualTotal = accounts.reduce(
      (total, account) => total + account.initialBalanceCents + (movementById.get(account.id) ?? 0),
      0,
    );

    const consolidated = await consolidatedOf();
    expect(consolidated.assetsBalanceCents).toBe(manualTotal);
  });
});

describe("compra no cartão reduz o patrimônio no ato", () => {
  it("cai o líquido assim que a compra é lançada, sem esperar fatura ou pagamento", async () => {
    const antes = await consolidatedOf();
    await purchase(cardId, "2026-08-10", 45_000);
    const depois = await consolidatedOf();

    expect(depois.netWorthCents).toBe(antes.netWorthCents - 45_000);
  });
});

describe("limite de cartão nunca soma entre cartões nem entra em patrimônio", () => {
  it("cada cartão calcula o próprio limite, independente do outro", async () => {
    await purchase(cardId, "2026-08-10", 45_000);
    await purchase(secondCardId, "2026-08-10", 12_000);

    const { accounts } = await listAccounts();
    const cardA = accounts.find((account) => account.id === cardId)!.creditCard!;
    const cardB = accounts.find((account) => account.id === secondCardId)!.creditCard!;

    expect(cardA.availableLimitCents).toBe(1_000_000 - 45_000);
    expect(cardB.availableLimitCents).toBe(300_000 - 12_000);
  });

  it("mudar o limite de um cartão não muda o do outro nem o patrimônio", async () => {
    await purchase(cardId, "2026-08-10", 45_000);
    await purchase(secondCardId, "2026-08-10", 12_000);
    const before = await listAccounts();

    await prisma.creditCardDetails.updateMany({
      where: { accountId: cardId },
      data: { creditLimitCents: 5_000_000 },
    });

    const after = await listAccounts();
    const cardBAfter = after.accounts.find((account) => account.id === secondCardId)!.creditCard!;
    const cardBBefore = before.accounts.find((account) => account.id === secondCardId)!.creditCard!;

    expect(cardBAfter.availableLimitCents).toBe(cardBBefore.availableLimitCents);
    expect(after.consolidated.netWorthCents).toBe(before.consolidated.netWorthCents);
  });

  it("o consolidado não expõe nenhum campo de limite, somado ou não", async () => {
    await purchase(cardId, "2026-08-10", 45_000);
    await purchase(secondCardId, "2026-08-10", 12_000);
    const { consolidated } = await listAccounts();

    expect(Object.keys(consolidated).sort()).toEqual([
      "assetsBalanceCents",
      "liabilitiesBalanceCents",
      "netWorthCents",
      "openInvoicesCents",
    ]);
  });
});
