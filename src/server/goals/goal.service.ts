import { fromZonedParts, toDateParts } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import { monthKey } from "@/server/categories/category.stats";
import {
  buildGoalPace,
  buildGoalSeries,
  buildMonthlySaved,
  type Contribution,
} from "./goal.projection";
import type { ContributionInput, GoalInput } from "./goal.schema";
import type { GoalDetail, GoalListing } from "./goal.types";

export type GoalErrorCode = "NOT_FOUND" | "ACCOUNT_REQUIRED";

export class GoalServiceError extends Error {
  constructor(
    readonly code: GoalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoalServiceError";
  }
}

export async function listGoals(reference: Date = new Date()): Promise<GoalListing> {
  const userId = await requireUserId();

  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: [{ archived: "asc" }, { targetDate: "asc" }],
    include: {
      account: { select: { id: true, name: true, initialBalanceCents: true } },
      contributions: { orderBy: { date: "desc" } },
    },
  });

  const linkedIds = goals
    .filter((goal) => goal.useAccountBalance && goal.accountId)
    .map((goal) => goal.accountId as string);
  const accountHistory = await monthlyAccountBalances(userId, linkedIds, reference);

  const details = goals.map((goal) => {
    const contributions: Contribution[] = goal.contributions.map((contribution) => ({
      date: contribution.date,
      amountCents: contribution.amountCents,
    }));

    const linked =
      goal.useAccountBalance && goal.accountId ? accountHistory.get(goal.accountId) : undefined;

    const monthlySaved = linked ?? buildMonthlySaved(contributions, reference);
    const savedCents = monthlySaved.at(-1)?.savedCents ?? 0;

    // No modo saldo da conta, o ritmo vem da variação do saldo, não dos aportes.
    const paceSource = linked ? monthlyDeltas(linked) : contributions;
    const pace = buildGoalPace(
      savedCents,
      goal.targetCents,
      goal.targetDate,
      paceSource,
      reference,
    );

    return {
      id: goal.id,
      name: goal.name,
      color: goal.color,
      icon: goal.icon,
      targetDate: goal.targetDate,
      archived: goal.archived,
      accountId: goal.accountId,
      accountName: goal.account?.name ?? null,
      useAccountBalance: goal.useAccountBalance,
      pace,
      series: buildGoalSeries(
        monthlySaved,
        pace,
        reference,
        monthKey(toDateParts(goal.targetDate)),
      ),
      contributions: goal.contributions.map((contribution) => ({
        id: contribution.id,
        date: contribution.date,
        amountCents: contribution.amountCents,
        note: contribution.note,
      })),
    } satisfies GoalDetail;
  });

  return {
    active: details.filter((goal) => !goal.archived && !goal.pace.completed),
    completed: details.filter((goal) => !goal.archived && goal.pace.completed),
    archived: details.filter((goal) => goal.archived),
  };
}

export async function createGoal(input: GoalInput): Promise<string> {
  const userId = await requireUserId();

  const created = await prisma.goal.create({
    data: {
      userId,
      name: input.name,
      targetCents: input.targetCents,
      targetDate: fromISODate(input.targetDate),
      color: input.color,
      icon: input.icon,
      accountId: input.accountId,
      useAccountBalance: input.useAccountBalance,
    },
    select: { id: true },
  });

  return created.id;
}

export async function updateGoal(goalId: string, input: GoalInput): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: {
      name: input.name,
      targetCents: input.targetCents,
      targetDate: fromISODate(input.targetDate),
      color: input.color,
      icon: input.icon,
      accountId: input.accountId,
      useAccountBalance: input.useAccountBalance,
    },
  });

  if (count === 0) throw notFound();
}

export async function setGoalArchived(goalId: string, archived: boolean): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: { archived },
  });

  if (count === 0) throw notFound();
}

export async function addContribution(input: ContributionInput): Promise<void> {
  const userId = await requireUserId();

  const goal = await prisma.goal.findFirst({
    where: { id: input.goalId, userId },
    select: { id: true },
  });
  if (!goal) throw notFound();

  await prisma.goalContribution.create({
    data: {
      goalId: input.goalId,
      date: fromISODate(input.date),
      amountCents: input.amountCents,
      note: input.note,
    },
  });
}

export async function removeContribution(contributionId: string): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.goalContribution.deleteMany({
    where: { id: contributionId, goal: { userId } },
  });

  if (count === 0) throw new GoalServiceError("NOT_FOUND", "Aporte não encontrado.");
}

/**
 * Saldo acumulado mês a mês das contas vinculadas. É o equivalente ao acumulado de aportes
 * quando a meta acompanha o saldo de uma conta em vez de depósitos avulsos.
 */
async function monthlyAccountBalances(
  userId: string,
  accountIds: readonly string[],
  reference: Date,
): Promise<Map<string, { month: string; savedCents: number }[]>> {
  const result = new Map<string, { month: string; savedCents: number }[]>();
  if (accountIds.length === 0) return result;

  const [accounts, transactions] = await Promise.all([
    prisma.account.findMany({
      where: { userId, id: { in: [...accountIds] } },
      select: { id: true, initialBalanceCents: true, createdAt: true },
    }),
    prisma.transaction.findMany({
      where: { userId, accountId: { in: [...accountIds] } },
      orderBy: { date: "asc" },
      select: { accountId: true, date: true, amountCents: true },
    }),
  ]);

  const currentMonth = monthKey(toDateParts(reference));

  for (const account of accounts) {
    const own = transactions.filter((transaction) => transaction.accountId === account.id);
    const deltaByMonth = new Map<string, number>();

    for (const transaction of own) {
      const key = monthKey(toDateParts(transaction.date));
      deltaByMonth.set(key, (deltaByMonth.get(key) ?? 0) + transaction.amountCents);
    }

    const months = [...new Set([...deltaByMonth.keys(), currentMonth])]
      .filter((month) => month <= currentMonth)
      .sort();

    let running = account.initialBalanceCents;
    result.set(
      account.id,
      months.map((month) => {
        running += deltaByMonth.get(month) ?? 0;
        return { month, savedCents: running };
      }),
    );
  }

  return result;
}

/** Variação de um mês para o outro, para alimentar o cálculo de ritmo. */
function monthlyDeltas(monthly: readonly { month: string; savedCents: number }[]): Contribution[] {
  return monthly.map((entry, index) => {
    const [year, month] = entry.month.split("-").map(Number);
    const previous = index === 0 ? 0 : monthly[index - 1].savedCents;

    return {
      date: fromZonedParts({ year, month, day: 1 }),
      amountCents: entry.savedCents - previous,
    };
  });
}

function fromISODate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return fromZonedParts({ year, month, day });
}

function notFound(): GoalServiceError {
  return new GoalServiceError("NOT_FOUND", "Meta não encontrada.");
}
