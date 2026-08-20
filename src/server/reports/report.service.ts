import type { Prisma } from "@prisma/client";
import { fromZonedParts, toDateParts } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { requireUserId } from "@/server/current-user";
import { monthKey } from "@/server/categories/category.stats";
import {
  buildBalanceEvolution,
  buildCategoryPivot,
  buildMonthlyCashFlow,
  collapseTail,
  compareToPrevious,
  monthsEndingAt,
  rankCategoryTotals,
  savingsRate,
  type BalancePoint,
  type CategoryPivot,
  type CategoryTotal,
  type MonthlyCashFlow,
  type Variation,
} from "./report.aggregations";

/**
 * Transferência fica de fora de tudo que é receita ou despesa. Este filtro é a única
 * forma de montar a cláusula desses relatórios — se aparecer uma consulta sem ele, é bug.
 */
const NOT_TRANSFER = { type: { not: "TRANSFER" } } satisfies Prisma.TransactionWhereInput;

const CATEGORY_LIMIT = 8;
const TOP_EXPENSES = 6;

export type AccountBalance = {
  id: string;
  name: string;
  color: string;
  balanceCents: number;
  isCreditCard: boolean;
};

export type TopExpense = {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  categoryName: string | null;
  accountName: string;
};

export type GoalProgress = {
  id: string;
  name: string;
  color: string;
  targetCents: number;
  savedCents: number;
  percent: number;
};

export type DashboardData = {
  income: Variation;
  expense: Variation;
  netCents: number;
  savingsRatePercent: number | null;
  categories: CategoryTotal[];
  balanceEvolution: BalancePoint[];
  topExpenses: TopExpense[];
  goals: GoalProgress[];
};

export async function getDashboard(period: ResolvedPeriod): Promise<DashboardData> {
  const userId = await requireUserId();
  const previous = previousWindow(period);

  const [current, before, categoryEntries, topExpenses, goals, evolution] = await Promise.all([
    sumSigned(userId, period.start, period.end),
    sumSigned(userId, previous.start, previous.end),
    prisma.transaction.findMany({
      where: {
        userId,
        ...NOT_TRANSFER,
        amountCents: { lt: 0 },
        date: { gte: period.start, lte: period.end },
      },
      select: {
        date: true,
        amountCents: true,
        categoryId: true,
        category: { select: { name: true } },
      },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        ...NOT_TRANSFER,
        amountCents: { lt: 0 },
        date: { gte: period.start, lte: period.end },
      },
      orderBy: { amountCents: "asc" },
      take: TOP_EXPENSES,
      select: {
        id: true,
        date: true,
        description: true,
        amountCents: true,
        category: { select: { name: true } },
        account: { select: { name: true } },
      },
    }),
    listGoalProgress(userId),
    balanceEvolution(userId, 6, period.end),
  ]);

  const income = compareToPrevious(current.incomeCents, before.incomeCents);
  const expense = compareToPrevious(current.expenseCents, before.expenseCents);

  return {
    income,
    expense,
    netCents: current.incomeCents - current.expenseCents,
    savingsRatePercent: savingsRate(current.incomeCents, current.expenseCents),
    categories: collapseTail(
      rankCategoryTotals(
        categoryEntries.map((entry) => ({
          date: entry.date,
          amountCents: entry.amountCents,
          categoryId: entry.categoryId,
          categoryName: entry.category?.name ?? null,
        })),
      ),
      CATEGORY_LIMIT,
    ),
    balanceEvolution: evolution,
    topExpenses: topExpenses.map((expense) => ({
      id: expense.id,
      date: expense.date,
      description: expense.description,
      amountCents: expense.amountCents,
      categoryName: expense.category?.name ?? null,
      accountName: expense.account.name,
    })),
    goals,
  };
}

export type CashFlowReport = {
  months: MonthlyCashFlow[];
};

export async function getCashFlowReport(
  monthCount: number,
  reference: Date = new Date(),
): Promise<CashFlowReport> {
  const userId = await requireUserId();

  const entries = await prisma.transaction.findMany({
    where: { userId, ...NOT_TRANSFER, date: { gte: windowStart(monthCount, reference) } },
    select: { date: true, amountCents: true },
  });

  return { months: buildMonthlyCashFlow(entries, monthCount, reference) };
}

export async function getCategoryPivot(
  monthCount: number,
  reference: Date = new Date(),
): Promise<CategoryPivot> {
  const userId = await requireUserId();

  const entries = await prisma.transaction.findMany({
    where: {
      userId,
      ...NOT_TRANSFER,
      amountCents: { lt: 0 },
      date: { gte: windowStart(monthCount, reference) },
    },
    select: {
      date: true,
      amountCents: true,
      categoryId: true,
      category: { select: { name: true } },
    },
  });

  return buildCategoryPivot(
    entries.map((entry) => ({
      date: entry.date,
      amountCents: entry.amountCents,
      categoryId: entry.categoryId,
      categoryName: entry.category?.name ?? null,
    })),
    monthCount,
    reference,
  );
}

export type CategoryTrend = {
  categoryId: string;
  name: string;
  months: MonthlyCashFlow[];
  totalCents: number;
  averageCents: number;
};

export async function getCategoryTrend(
  categoryId: string,
  monthCount: number,
  reference: Date = new Date(),
): Promise<CategoryTrend | null> {
  const userId = await requireUserId();

  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { id: true, name: true },
  });
  if (!category) return null;

  // Inclui as subcategorias: "quanto gastei com moradia" não separa o aluguel do resto.
  const children = await prisma.category.findMany({
    where: { userId, parentId: categoryId },
    select: { id: true },
  });
  const categoryIds = [categoryId, ...children.map((child) => child.id)];

  const entries = await prisma.transaction.findMany({
    where: {
      userId,
      ...NOT_TRANSFER,
      categoryId: { in: categoryIds },
      date: { gte: windowStart(monthCount, reference) },
    },
    select: { date: true, amountCents: true },
  });

  const months = buildMonthlyCashFlow(entries, monthCount, reference);
  const totalCents = months.reduce((total, month) => total + month.expenseCents, 0);

  return {
    categoryId: category.id,
    name: category.name,
    months,
    totalCents,
    averageCents: Math.round(totalCents / monthCount),
  };
}

export async function listAccountBalances(): Promise<AccountBalance[]> {
  const userId = await requireUserId();

  const [accounts, movements] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true, class: true, initialBalanceCents: true },
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { userId },
      _sum: { amountCents: true },
    }),
  ]);

  const movementById = new Map(movements.map((row) => [row.accountId, row._sum.amountCents ?? 0]));

  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    color: account.color,
    balanceCents: account.initialBalanceCents + (movementById.get(account.id) ?? 0),
    isCreditCard: account.class === "LIABILITY",
  }));
}

async function listGoalProgress(userId: string): Promise<GoalProgress[]> {
  const goals = await prisma.goal.findMany({
    where: { userId, archived: false },
    orderBy: { targetDate: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      targetCents: true,
      contributions: { select: { amountCents: true } },
    },
  });

  return goals.map((goal) => {
    const savedCents = goal.contributions.reduce(
      (total, contribution) => total + contribution.amountCents,
      0,
    );

    return {
      id: goal.id,
      name: goal.name,
      color: goal.color,
      targetCents: goal.targetCents,
      savedCents,
      percent: goal.targetCents <= 0 ? 0 : Math.round((savedCents / goal.targetCents) * 1000) / 10,
    };
  });
}

async function balanceEvolution(
  userId: string,
  monthCount: number,
  reference: Date,
): Promise<BalancePoint[]> {
  const start = windowStart(monthCount, reference);
  const months = monthsEndingAt(monthCount, reference);

  // Transferência entra aqui de propósito: as duas pernas se anulam e o saldo não muda.
  const [accounts, before, inside] = await Promise.all([
    prisma.account.aggregate({
      where: { userId, archived: false },
      _sum: { initialBalanceCents: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, date: { lt: start } },
      _sum: { amountCents: true },
    }),
    prisma.transaction.findMany({
      where: { userId, date: { gte: start } },
      select: { date: true, amountCents: true },
    }),
  ]);

  const deltaByMonth = new Map(months.map((month) => [month, 0]));
  for (const entry of inside) {
    const key = monthKey(toDateParts(entry.date));
    const current = deltaByMonth.get(key);
    if (current === undefined) continue;
    deltaByMonth.set(key, current + entry.amountCents);
  }

  const opening = (accounts._sum.initialBalanceCents ?? 0) + (before._sum.amountCents ?? 0);

  return buildBalanceEvolution(
    opening,
    months.map((month) => ({ month, deltaCents: deltaByMonth.get(month) ?? 0 })),
  );
}

async function sumSigned(
  userId: string,
  start: Date,
  end: Date,
): Promise<{ incomeCents: number; expenseCents: number }> {
  const where = { userId, ...NOT_TRANSFER, date: { gte: start, lte: end } };

  const [income, expense] = await Promise.all([
    prisma.transaction.aggregate({
      where: { ...where, amountCents: { gte: 0 } },
      _sum: { amountCents: true },
    }),
    prisma.transaction.aggregate({
      where: { ...where, amountCents: { lt: 0 } },
      _sum: { amountCents: true },
    }),
  ]);

  return {
    incomeCents: income._sum.amountCents ?? 0,
    expenseCents: Math.abs(expense._sum.amountCents ?? 0),
  };
}

function previousWindow(period: ResolvedPeriod): { start: Date; end: Date } {
  const span = period.end.getTime() - period.start.getTime();

  return {
    start: new Date(period.start.getTime() - span - 1),
    end: new Date(period.start.getTime() - 1),
  };
}

/** Primeiro instante do mês mais antigo da janela, no calendário de São Paulo. */
function windowStart(monthCount: number, reference: Date): Date {
  const [first] = monthsEndingAt(monthCount, reference);
  const [year, month] = first.split("-").map(Number);

  return fromZonedParts({ year, month, day: 1 });
}
