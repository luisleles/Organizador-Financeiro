import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  BudgetServiceError,
  copyPreviousMonth,
  getBudgetHistory,
  getMonthlyBudgets,
  monthToDate,
  removeBudget,
  setBudget,
  shiftMonth,
} from "./budget.service";

const MONTH = "2026-08";
const DAY_10 = new Date("2026-08-10T15:00:00Z");

let accountId: string;
let housingId: string;
let rentId: string;
let foodId: string;

async function expense(isoDate: string, categoryId: string, amountCents: number) {
  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  await prisma.transaction.create({
    data: {
      userId: user.id,
      accountId,
      categoryId,
      date: new Date(`${isoDate}T15:00:00Z`),
      description: "gasto",
      amountCents: -amountCents,
      type: "EXPENSE",
    },
  });
}

beforeAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "budget@example.com", passwordHash: "x" },
  });

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Corrente",
      type: "CHECKING",
      class: "ASSET",
      initialBalanceCents: 0,
      color: "#0B6E75",
      icon: "landmark",
    },
  });
  accountId = account.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.category.deleteMany();

  const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
  const housing = await prisma.category.create({
    data: { userId: user.id, name: "Moradia", kind: "EXPENSE", color: "#A85B12", icon: "home" },
  });
  const rent = await prisma.category.create({
    data: {
      userId: user.id,
      name: "Aluguel",
      kind: "EXPENSE",
      color: "#A85B12",
      icon: "home",
      parentId: housing.id,
    },
  });
  const food = await prisma.category.create({
    data: { userId: user.id, name: "Alimentação", kind: "EXPENSE", color: "#0B6E75", icon: "cart" },
  });

  housingId = housing.id;
  rentId = rent.id;
  foodId = food.id;
});

describe("acompanhamento do mês", () => {
  it("soma o gasto da subcategoria no limite do pai", async () => {
    await setBudget({ categoryId: housingId, month: MONTH, limitCents: 300000 });
    await expense("2026-08-05", rentId, 180000);
    await expense("2026-08-06", housingId, 20000);

    const { rows } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(rows).toHaveLength(1);
    expect(rows[0].progress.spentCents).toBe(200000);
    expect(rows[0].hasChildren).toBe(true);
  });

  it("marca atenção quando o gasto passa do ritmo mas cabe no limite", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 300000 });
    await expense("2026-08-03", foodId, 180000);

    const { rows, monthProgress } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(monthProgress).toBeCloseTo(10 / 31);
    expect(rows[0].progress.status).toBe("atencao");
    expect(rows[0].progress.aheadOfPaceCents).toBeGreaterThan(0);
  });

  it("marca estourado e conta no total", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await expense("2026-08-03", foodId, 130000);

    const { rows, totals } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(rows[0].progress.status).toBe("estourado");
    expect(rows[0].progress.remainingCents).toBe(-30000);
    expect(totals.overCount).toBe(1);
  });

  it("ignora lançamento de outro mês", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await expense("2026-07-20", foodId, 90000);

    const { rows } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(rows[0].progress.spentCents).toBe(0);
  });

  it("ignora transferência", async () => {
    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId,
        categoryId: foodId,
        date: new Date("2026-08-05T15:00:00Z"),
        description: "transferência",
        amountCents: -50000,
        type: "TRANSFER",
      },
    });

    const { rows } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(rows[0].progress.spentCents).toBe(0);
  });

  it("consolida o total orçado contra o total gasto", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await setBudget({ categoryId: housingId, month: MONTH, limitCents: 300000 });
    await expense("2026-08-05", foodId, 40000);
    await expense("2026-08-05", rentId, 180000);

    const { totals } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(totals.limitCents).toBe(400000);
    expect(totals.spentCents).toBe(220000);
  });

  it("lista as categorias que ainda não têm limite", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });

    const { unbudgeted } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(unbudgeted.map((category) => category.name).sort()).toEqual(["Aluguel", "Moradia"]);
  });
});

describe("definir e remover limite", () => {
  it("sobrescreve o limite ao definir de novo no mesmo mês", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 250000 });

    const { rows } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(rows).toHaveLength(1);
    expect(rows[0].progress.limitCents).toBe(250000);
  });

  it("remove o limite", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await removeBudget(foodId, MONTH);

    expect((await getMonthlyBudgets(MONTH, DAY_10)).rows).toHaveLength(0);
  });

  it("recusa remover o que não existe", async () => {
    await expect(removeBudget(foodId, MONTH)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("copiar do mês anterior", () => {
  const previous = shiftMonth(MONTH, -1);

  it("traz os limites do mês anterior", async () => {
    await setBudget({ categoryId: foodId, month: previous, limitCents: 100000 });
    await setBudget({ categoryId: housingId, month: previous, limitCents: 300000 });

    const copied = await copyPreviousMonth(MONTH);
    const { rows } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(copied).toBe(2);
    expect(rows.map((row) => row.progress.limitCents).sort((a, b) => a - b)).toEqual([
      100000, 300000,
    ]);
  });

  it("não sobrescreve limite já definido no mês de destino", async () => {
    await setBudget({ categoryId: foodId, month: previous, limitCents: 100000 });
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 500000 });

    const copied = await copyPreviousMonth(MONTH);
    const { rows } = await getMonthlyBudgets(MONTH, DAY_10);

    expect(copied).toBe(0);
    expect(rows[0].progress.limitCents).toBe(500000);
  });

  it("avisa quando o mês anterior está vazio", async () => {
    await expect(copyPreviousMonth(MONTH)).rejects.toMatchObject({ code: "NOTHING_TO_COPY" });
  });

  it("atravessa a virada do ano", async () => {
    await setBudget({ categoryId: foodId, month: "2025-12", limitCents: 100000 });

    expect(await copyPreviousMonth("2026-01")).toBe(1);
  });
});

describe("histórico de aderência", () => {
  it("mostra seis meses, marcando os que não tinham orçamento", async () => {
    await setBudget({ categoryId: foodId, month: MONTH, limitCents: 100000 });
    await setBudget({ categoryId: foodId, month: "2026-07", limitCents: 100000 });
    await expense("2026-07-10", foodId, 130000);
    await expense("2026-08-10", foodId, 40000);

    const history = await getBudgetHistory(MONTH, 6);

    expect(history.months).toHaveLength(6);
    expect(history.rows).toHaveLength(1);

    const julho = history.rows[0].months.find((month) => month.month === "2026-07");
    const marco = history.rows[0].months.find((month) => month.month === "2026-03");

    expect(julho?.status).toBe("estourado");
    expect(marco?.status).toBeNull();
  });
});

describe("monthToDate", () => {
  it("guarda o primeiro dia do mês no fuso de São Paulo", () => {
    expect(monthToDate("2026-08").toISOString()).toBe("2026-08-01T03:00:00.000Z");
  });
});

describe("shiftMonth", () => {
  it("anda para trás e para frente atravessando o ano", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("BudgetServiceError", () => {
  it("é o tipo lançado pelo serviço", async () => {
    await expect(copyPreviousMonth("2026-05")).rejects.toBeInstanceOf(BudgetServiceError);
  });
});
