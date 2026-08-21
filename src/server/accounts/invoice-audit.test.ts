import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { findMisallocatedGroups, reallocateGroup } from "./invoice-audit";

let cardId: string;
let cardDetailsId: string;

beforeAll(async () => {
  await prisma.user.deleteMany();
  const user = await prisma.user.create({
    data: { name: "Auditoria", email: "auditoria@example.com", passwordHash: "x" },
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
      creditCardDetails: { create: { closingDay: 20, dueDay: 28, creditLimitCents: 1_000_000 } },
    },
    include: { creditCardDetails: true },
  });
  cardId = card.id;
  cardDetailsId = card.creditCardDetails!.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.invoice.deleteMany();
});

/** Fatura de agosto (fecha dia 20), com o formato de referência que `invoiceScheduleForPurchase` usa. */
function createInvoice(referenceMonth: string, closingDate: string, paidAt: string | null) {
  return prisma.invoice.create({
    data: {
      creditCardDetailsId: cardDetailsId,
      referenceMonth: new Date(`${referenceMonth}-01T03:00:00.000Z`),
      closingDate: new Date(closingDate),
      dueDate: new Date(closingDate), // irrelevante para a auditoria
      paidAt: paidAt ? new Date(paidAt) : null,
    },
  });
}

async function userId(): Promise<string> {
  return (await prisma.user.findFirstOrThrow()).id;
}

describe("findMisallocatedGroups", () => {
  it("acha uma compra que a regra antiga empurrou para a fatura seguinte", async () => {
    const uid = await userId();
    await createInvoice("2026-08", "2026-08-20T03:00:00.000Z", "2026-08-05T03:00:00.000Z");
    const september = await createInvoice("2026-09", "2026-09-20T03:00:00.000Z", null);

    const transaction = await prisma.transaction.create({
      data: {
        userId: uid,
        accountId: cardId,
        invoiceId: september.id,
        date: new Date("2026-08-10T03:00:00.000Z"),
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        description: "Compra presa pelo bug",
        amountCents: -5000,
        type: "EXPENSE",
      },
    });

    const groups = await findMisallocatedGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].description).toBe("Compra presa pelo bug");
    const [installment] = groups[0].installments;
    expect(installment.transactionId).toBe(transaction.id);
    expect(installment.currentReferenceMonth.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(installment.correctSchedule.referenceMonth.toISOString()).toBe(
      "2026-08-01T03:00:00.000Z",
    );
  });

  it("ignora uma compra na fatura seguinte quando a fatura anterior nunca foi paga", async () => {
    const uid = await userId();
    await createInvoice("2026-08", "2026-08-20T03:00:00.000Z", null);
    const september = await createInvoice("2026-09", "2026-09-20T03:00:00.000Z", null);

    await prisma.transaction.create({
      data: {
        userId: uid,
        accountId: cardId,
        invoiceId: september.id,
        date: new Date("2026-08-10T03:00:00.000Z"),
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        description: "Movida por outro motivo",
        amountCents: -5000,
        type: "EXPENSE",
      },
    });

    expect(await findMisallocatedGroups()).toEqual([]);
  });

  it("ignora uma compra que já foi corretamente alocada na fatura seguinte por ter fechado de verdade", async () => {
    const uid = await userId();
    await createInvoice("2026-08", "2026-08-20T03:00:00.000Z", "2026-08-05T03:00:00.000Z");
    const september = await createInvoice("2026-09", "2026-09-20T03:00:00.000Z", null);

    // Lançamento criado depois que agosto já tinha fechado de verdade: a fatura de agosto
    // não estava mais aberta no instante em que a compra foi criada, então empurrar para
    // setembro foi a decisão certa, não o bug.
    await prisma.transaction.create({
      data: {
        userId: uid,
        accountId: cardId,
        invoiceId: september.id,
        date: new Date("2026-08-15T03:00:00.000Z"),
        createdAt: new Date("2026-08-25T12:00:00.000Z"),
        description: "Lançamento atrasado legítimo",
        amountCents: -5000,
        type: "EXPENSE",
      },
    });

    expect(await findMisallocatedGroups()).toEqual([]);
  });

  it("encadeia o grupo inteiro de parcelas a partir da primeira", async () => {
    const uid = await userId();
    await createInvoice("2026-08", "2026-08-20T03:00:00.000Z", "2026-08-05T03:00:00.000Z");
    const september = await createInvoice("2026-09", "2026-09-20T03:00:00.000Z", null);
    const october = await createInvoice("2026-10", "2026-10-20T03:00:00.000Z", null);
    const november = await createInvoice("2026-11", "2026-11-20T03:00:00.000Z", null);

    const groupId = crypto.randomUUID();
    await prisma.transaction.createMany({
      data: [
        {
          userId: uid,
          accountId: cardId,
          invoiceId: september.id,
          date: new Date("2026-08-10T03:00:00.000Z"),
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          description: "Compra em 3x (1/3)",
          amountCents: -3334,
          type: "EXPENSE",
          installmentGroupId: groupId,
          installmentNumber: 1,
          installmentTotal: 3,
        },
        {
          userId: uid,
          accountId: cardId,
          invoiceId: october.id,
          date: new Date("2026-09-10T03:00:00.000Z"),
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          description: "Compra em 3x (2/3)",
          amountCents: -3333,
          type: "EXPENSE",
          installmentGroupId: groupId,
          installmentNumber: 2,
          installmentTotal: 3,
        },
        {
          userId: uid,
          accountId: cardId,
          invoiceId: november.id,
          date: new Date("2026-10-10T03:00:00.000Z"),
          createdAt: new Date("2026-08-10T12:00:00.000Z"),
          description: "Compra em 3x (3/3)",
          amountCents: -3333,
          type: "EXPENSE",
          installmentGroupId: groupId,
          installmentNumber: 3,
          installmentTotal: 3,
        },
      ],
    });

    const groups = await findMisallocatedGroups();
    expect(groups).toHaveLength(1);
    expect(
      groups[0].installments.map((i) => i.correctSchedule.referenceMonth.toISOString()),
    ).toEqual(["2026-08-01T03:00:00.000Z", "2026-09-01T03:00:00.000Z", "2026-10-01T03:00:00.000Z"]);
  });
});

describe("reallocateGroup", () => {
  it("move só as parcelas que divergem, criando a fatura de destino quando falta", async () => {
    const uid = await userId();
    await createInvoice("2026-08", "2026-08-20T03:00:00.000Z", "2026-08-05T03:00:00.000Z");
    const september = await createInvoice("2026-09", "2026-09-20T03:00:00.000Z", null);

    const transaction = await prisma.transaction.create({
      data: {
        userId: uid,
        accountId: cardId,
        invoiceId: september.id,
        date: new Date("2026-08-10T03:00:00.000Z"),
        createdAt: new Date("2026-08-10T12:00:00.000Z"),
        description: "Compra presa pelo bug",
        amountCents: -5000,
        type: "EXPENSE",
      },
    });

    const [group] = await findMisallocatedGroups();
    const moved = await reallocateGroup(group);
    expect(moved).toBe(1);

    const updated = await prisma.transaction.findUniqueOrThrow({
      where: { id: transaction.id },
      include: { invoice: { select: { referenceMonth: true } } },
    });
    expect(updated.invoice?.referenceMonth.toISOString()).toBe("2026-08-01T03:00:00.000Z");
    expect(await findMisallocatedGroups()).toEqual([]);
  });
});
