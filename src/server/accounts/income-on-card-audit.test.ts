import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  convertFindingToInvoicePayment,
  convertFindingToRefund,
  deleteFinding,
  findIncomeOnCreditCard,
} from "./income-on-card-audit";

let userId: string;
let cardId: string;
let checkingId: string;

beforeAll(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { name: "Auditoria", email: "auditoria@example.com", passwordHash: "x" },
  });
  userId = user.id;

  const [card, checking] = await Promise.all([
    prisma.account.create({
      data: {
        userId,
        name: "Cartão",
        type: "CREDIT_CARD",
        class: "LIABILITY",
        initialBalanceCents: 0,
        color: "#B0234A",
        icon: "credit-card",
        creditCardDetails: { create: { closingDay: 20, dueDay: 28, creditLimitCents: 1_000_000 } },
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Corrente",
        type: "CHECKING",
        class: "ASSET",
        initialBalanceCents: 500_000,
        color: "#0B6E75",
        icon: "landmark",
      },
    }),
  ]);
  cardId = card.id;
  checkingId = checking.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
});

async function legacyIncome(amountCents: number) {
  return prisma.transaction.create({
    data: {
      userId,
      accountId: cardId,
      date: new Date("2026-08-05T03:00:00.000Z"),
      description: "Estorno antigo",
      amountCents,
      type: "INCOME",
      provider: "manual",
    },
  });
}

describe("findIncomeOnCreditCard", () => {
  it("encontra receita gravada direto num cartão", async () => {
    const row = await legacyIncome(5_000);
    const findings = await findIncomeOnCreditCard();

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      transactionId: row.id,
      accountId: cardId,
      amountCents: 5_000,
    });
  });

  it("ignora receita em conta comum", async () => {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: checkingId,
        date: new Date("2026-08-05T03:00:00.000Z"),
        description: "Salário",
        amountCents: 500_000,
        type: "INCOME",
        provider: "manual",
      },
    });

    expect(await findIncomeOnCreditCard()).toEqual([]);
  });
});

describe("convertFindingToRefund", () => {
  it("só troca o tipo, sem mudar valor nem data", async () => {
    const row = await legacyIncome(5_000);
    await convertFindingToRefund(row.id);

    const updated = await prisma.transaction.findUniqueOrThrow({ where: { id: row.id } });
    expect(updated.type).toBe("REFUND");
    expect(updated.amountCents).toBe(5_000);
    expect(await findIncomeOnCreditCard()).toEqual([]);
  });
});

describe("convertFindingToInvoicePayment", () => {
  it("cria a perna que falta na conta de origem, ligadas pelo mesmo grupo", async () => {
    const row = await legacyIncome(5_000);
    await convertFindingToInvoicePayment(row.id, checkingId);

    const [cardLeg, originLeg] = await Promise.all([
      prisma.transaction.findUniqueOrThrow({ where: { id: row.id } }),
      prisma.transaction.findFirstOrThrow({ where: { accountId: checkingId } }),
    ]);

    expect(cardLeg.type).toBe("TRANSFER");
    expect(originLeg.type).toBe("TRANSFER");
    expect(originLeg.amountCents).toBe(-5_000);
    expect(originLeg.transferGroupId).toBe(cardLeg.transferGroupId);
    expect(await findIncomeOnCreditCard()).toEqual([]);
  });
});

describe("deleteFinding", () => {
  it("remove o lançamento", async () => {
    const row = await legacyIncome(5_000);
    await deleteFinding(row.id);

    expect(await prisma.transaction.findUnique({ where: { id: row.id } })).toBeNull();
  });
});
