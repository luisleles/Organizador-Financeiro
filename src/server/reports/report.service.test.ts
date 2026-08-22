import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { createTransaction, registerRefund } from "@/server/transactions/transaction.service";
import { getDashboard } from "./report.service";

const AGOSTO: ResolvedPeriod = {
  start: new Date("2026-08-01T03:00:00.000Z"),
  end: new Date("2026-09-01T02:59:59.999Z"),
  label: "agosto de 2026",
};

let userId: string;
let cardId: string;

beforeAll(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { name: "Relatórios", email: "relatorios@example.com", passwordHash: "x" },
  });
  userId = user.id;

  const card = await prisma.account.create({
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
  });
  cardId = card.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
});

describe("estorno não é receita em relatório", () => {
  it("não entra na receita do período nem no líquido", async () => {
    await createTransaction({
      date: "2026-08-10",
      description: "Compra",
      amountCents: 30_000,
      type: "EXPENSE",
      accountId: cardId,
      categoryId: null,
      tagIds: [],
      notes: null,
      installments: 1,
      installmentScope: "SINGLE",
    });

    const before = await getDashboard(AGOSTO);
    await registerRefund(cardId, 10_000, new Date("2026-08-11T03:00:00.000Z"), "Devolução");
    const after = await getDashboard(AGOSTO);

    expect(after.income.currentCents).toBe(before.income.currentCents);
    expect(after.netCents).toBe(before.netCents);
  });
});
