import { fromZonedParts, toDateParts } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import { monthKey } from "@/server/categories/category.stats";
import { monthsEndingAt } from "@/server/reports/report.aggregations";
import { buildBudgetProgress, monthAdherence, monthProgress } from "./budget.pace";
import type { BudgetInput } from "./budget.schema";
import type { BudgetHistory, BudgetRow, BudgetTotals, MonthlyBudgets } from "./budget.types";

export type BudgetErrorCode = "NOT_FOUND" | "NOTHING_TO_COPY";

export class BudgetServiceError extends Error {
  constructor(
    readonly code: BudgetErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BudgetServiceError";
  }
}

export function monthToDate(month: string): Date {
  const [year, monthNumber] = month.split("-").map(Number);
  return fromZonedParts({ year, month: monthNumber, day: 1 });
}

export function currentMonth(reference: Date = new Date()): string {
  return monthKey(toDateParts(reference));
}

export function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return monthKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: 1,
  });
}

/**
 * O orçamento de uma categoria-pai cobre o que foi lançado nas subcategorias — é assim que
 * a pessoa pensa em "meu limite de moradia", mesmo tendo lançado em "aluguel".
 */
export async function getMonthlyBudgets(
  month: string,
  reference: Date = new Date(),
): Promise<MonthlyBudgets> {
  const userId = await requireUserId();
  const { start, end } = monthWindow(month);
  const progress = monthProgress(reference, monthParts(month));

  const [budgets, categories, spending] = await Promise.all([
    prisma.budget.findMany({
      where: { userId, month: monthToDate(month) },
      select: { categoryId: true, limitCents: true },
    }),
    prisma.category.findMany({
      where: { userId, archived: false, kind: "EXPENSE" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, color: true, icon: true, parentId: true },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        type: { not: "TRANSFER" },
        amountCents: { lt: 0 },
        date: { gte: start, lte: end },
      },
      _sum: { amountCents: true },
    }),
  ]);

  const spentById = new Map(
    spending
      .filter((row) => row.categoryId !== null)
      .map((row) => [row.categoryId as string, Math.abs(row._sum.amountCents ?? 0)]),
  );
  const childrenOf = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    childrenOf.set(category.parentId, [...(childrenOf.get(category.parentId) ?? []), category.id]);
  }

  const spentFor = (categoryId: string): number =>
    (spentById.get(categoryId) ?? 0) +
    (childrenOf.get(categoryId) ?? []).reduce(
      (total, childId) => total + (spentById.get(childId) ?? 0),
      0,
    );

  const limitById = new Map(budgets.map((budget) => [budget.categoryId, budget.limitCents]));
  const byId = new Map(categories.map((category) => [category.id, category]));

  const rows: BudgetRow[] = [...limitById.entries()]
    .map(([categoryId, limitCents]) => {
      const category = byId.get(categoryId);
      if (!category) return null;

      return {
        categoryId,
        name: category.name,
        color: category.color,
        icon: category.icon,
        hasChildren: (childrenOf.get(categoryId) ?? []).length > 0,
        progress: buildBudgetProgress(spentFor(categoryId), limitCents, progress),
      };
    })
    .filter((row): row is BudgetRow => row !== null)
    .sort((a, b) => b.progress.usedPercent - a.progress.usedPercent);

  const limitTotal = rows.reduce((total, row) => total + row.progress.limitCents, 0);
  const spentTotal = rows.reduce((total, row) => total + row.progress.spentCents, 0);

  const totals: BudgetTotals = {
    limitCents: limitTotal,
    spentCents: spentTotal,
    progress: buildBudgetProgress(spentTotal, limitTotal, progress),
    overCount: rows.filter((row) => row.progress.status === "estourado").length,
  };

  return {
    month,
    monthProgress: progress,
    rows,
    totals,
    unbudgeted: categories
      .filter((category) => !limitById.has(category.id))
      .map((category) => ({ id: category.id, name: category.name })),
  };
}

export async function setBudget(input: BudgetInput): Promise<void> {
  const userId = await requireUserId();
  const month = monthToDate(input.month);

  await prisma.budget.upsert({
    where: { userId_categoryId_month: { userId, categoryId: input.categoryId, month } },
    create: { userId, categoryId: input.categoryId, month, limitCents: input.limitCents },
    update: { limitCents: input.limitCents },
  });
}

export async function removeBudget(categoryId: string, month: string): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.budget.deleteMany({
    where: { userId, categoryId, month: monthToDate(month) },
  });

  if (count === 0) throw new BudgetServiceError("NOT_FOUND", "Orçamento não encontrado.");
}

/** Copia os limites do mês anterior, sem sobrescrever o que já foi definido neste mês. */
export async function copyPreviousMonth(month: string): Promise<number> {
  const userId = await requireUserId();
  const previous = shiftMonth(month, -1);

  return prisma.$transaction(async (tx) => {
    const [source, existing] = await Promise.all([
      tx.budget.findMany({
        where: { userId, month: monthToDate(previous) },
        select: { categoryId: true, limitCents: true },
      }),
      tx.budget.findMany({
        where: { userId, month: monthToDate(month) },
        select: { categoryId: true },
      }),
    ]);

    if (source.length === 0) {
      throw new BudgetServiceError(
        "NOTHING_TO_COPY",
        "O mês anterior não tem nenhum orçamento definido.",
      );
    }

    const alreadySet = new Set(existing.map((budget) => budget.categoryId));
    const toCreate = source.filter((budget) => !alreadySet.has(budget.categoryId));

    if (toCreate.length > 0) {
      await tx.budget.createMany({
        data: toCreate.map((budget) => ({
          userId,
          categoryId: budget.categoryId,
          month: monthToDate(month),
          limitCents: budget.limitCents,
        })),
      });
    }

    return toCreate.length;
  });
}

export async function getBudgetHistory(month: string, monthCount = 6): Promise<BudgetHistory> {
  const userId = await requireUserId();
  const months = monthsEndingAt(monthCount, monthToDate(month));
  const firstDate = monthToDate(months[0]);
  const { end } = monthWindow(months[months.length - 1]);

  const [budgets, categories, transactions] = await Promise.all([
    prisma.budget.findMany({
      where: { userId, month: { gte: firstDate } },
      select: { categoryId: true, month: true, limitCents: true },
    }),
    prisma.category.findMany({
      where: { userId },
      select: { id: true, name: true, parentId: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        type: { not: "TRANSFER" },
        amountCents: { lt: 0 },
        date: { gte: firstDate, lte: end },
      },
      select: { date: true, amountCents: true, categoryId: true },
    }),
  ]);

  const nameById = new Map(categories.map((category) => [category.id, category.name]));
  const parentById = new Map(categories.map((category) => [category.id, category.parentId]));

  const spent = new Map<string, number>();
  for (const transaction of transactions) {
    if (!transaction.categoryId) continue;
    const key = monthKey(toDateParts(transaction.date));
    const value = Math.abs(transaction.amountCents);

    // Conta na própria categoria e também no pai, que é quem carrega o limite.
    for (const id of [transaction.categoryId, parentById.get(transaction.categoryId)]) {
      if (!id) continue;
      spent.set(`${id}:${key}`, (spent.get(`${id}:${key}`) ?? 0) + value);
    }
  }

  const limits = new Map<string, number>();
  const budgetedIds = new Set<string>();
  for (const budget of budgets) {
    const key = monthKey(toDateParts(budget.month));
    if (!months.includes(key)) continue;
    limits.set(`${budget.categoryId}:${key}`, budget.limitCents);
    budgetedIds.add(budget.categoryId);
  }

  const rows = [...budgetedIds]
    .map((categoryId) => ({
      categoryId,
      name: nameById.get(categoryId) ?? "Categoria removida",
      months: months.map((key) =>
        monthAdherence(
          key,
          limits.get(`${categoryId}:${key}`) ?? null,
          spent.get(`${categoryId}:${key}`) ?? 0,
        ),
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { months, rows };
}

/** Quantas categorias estouraram no mês — é o que acende o alerta do painel. */
export async function countOverBudget(month: string): Promise<number> {
  const { totals } = await getMonthlyBudgets(month);
  return totals.overCount;
}

function monthParts(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return { year, month: monthNumber, day: 1 };
}

function monthWindow(month: string): { start: Date; end: Date } {
  const parts = monthParts(month);
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();

  return {
    start: fromZonedParts(parts),
    end: fromZonedParts({ ...parts, day: lastDay }, true),
  };
}
