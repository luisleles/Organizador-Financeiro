import type { Prisma } from "@prisma/client";
import { fromZonedParts, toDateParts } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { YIELD_CATEGORY_NAME } from "@/server/categories/system-categories";
import { requireUserId } from "@/server/current-user";
import { monthKey } from "@/server/categories/category.stats";
import {
  BUCKET_RULE_MESSAGES,
  BUCKET_TYPE,
  decomposeBucketBalance,
  validateBucketParent,
  type BucketRuleCode,
} from "@/server/accounts/account.buckets";
import { buildGoalPace, buildGoalSeries, type Contribution } from "./goal.projection";
import type { GoalInput, GoalMovement, YieldBatch } from "./goal.schema";
import type { GoalBucket, GoalDetail, GoalListing, GoalMovementRow } from "./goal.types";

export type GoalErrorCode =
  | "NOT_FOUND"
  | "NO_BUCKET"
  | "BUCKET_EXISTS"
  | "INSUFFICIENT_PARENT_BALANCE"
  | "INSUFFICIENT_BUCKET_BALANCE"
  | "EMPTY_BUCKET"
  | BucketRuleCode;

export class GoalServiceError extends Error {
  constructor(
    readonly code: GoalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoalServiceError";
  }
}


const GOAL_INCLUDE = {
  bucketAccount: {
    include: {
      parentAccount: { select: { id: true, name: true } },
      transactions: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          date: true,
          description: true,
          amountCents: true,
          type: true,
        },
      },
    },
  },
} satisfies Prisma.GoalInclude;

export async function listGoals(reference: Date = new Date()): Promise<GoalListing> {
  const userId = await requireUserId();

  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: [{ archived: "asc" }, { targetDate: "asc" }],
    include: GOAL_INCLUDE,
  });

  const details = goals.map((goal) => toDetail(goal, reference));

  return {
    planning: details.filter((goal) => !goal.archived && goal.bucket === null),
    active: details.filter(
      (goal) => !goal.archived && goal.bucket !== null && !goal.pace.completed,
    ),
    completed: details.filter((goal) => !goal.archived && goal.pace.completed),
    archived: details.filter((goal) => goal.archived),
  };
}

export async function createGoal(input: GoalInput): Promise<string> {
  const userId = await requireUserId();

  const created = await prisma.goal.create({
    data: { userId, ...toGoalData(input) },
    select: { id: true },
  });

  return created.id;
}

export async function updateGoal(goalId: string, input: GoalInput): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: toGoalData(input),
  });

  if (count === 0) throw notFound();
}

/** A meta e a caixinha nascem juntas: ou as duas existem, ou nenhuma. */
export async function createBucketForGoal(
  goalId: string,
  parentAccountId: string,
): Promise<string> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const goal = await tx.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true, name: true, color: true, icon: true, bucketAccountId: true },
    });
    if (!goal) throw notFound();
    if (goal.bucketAccountId) {
      throw new GoalServiceError("BUCKET_EXISTS", "Esta meta já tem uma caixinha.");
    }

    const parent = await tx.account.findFirst({
      where: { id: parentAccountId, userId },
      select: { id: true, type: true, class: true, parentAccountId: true },
    });
    if (!parent) throw new GoalServiceError("NOT_FOUND", "Conta mãe não encontrada.");

    const violation = validateBucketParent({ type: BUCKET_TYPE }, parent);
    if (violation) throw new GoalServiceError(violation, BUCKET_RULE_MESSAGES[violation]);

    const bucket = await tx.account.create({
      data: {
        userId,
        name: goal.name,
        type: BUCKET_TYPE,
        class: "ASSET",
        initialBalanceCents: 0,
        color: goal.color,
        icon: goal.icon,
        parentAccountId: parent.id,
      },
      select: { id: true },
    });

    await tx.goal.update({ where: { id: goal.id }, data: { bucketAccountId: bucket.id } });
    return bucket.id;
  });
}

export async function depositToGoal(movement: GoalMovement): Promise<void> {
  const userId = await requireUserId();

  await prisma.$transaction(async (tx) => {
    const { bucket, parentId } = await requireBucket(tx, userId, movement.goalId);
    const available = await accountBalance(tx, parentId);

    if (available < movement.amountCents) {
      throw new GoalServiceError(
        "INSUFFICIENT_PARENT_BALANCE",
        "A conta mãe não tem saldo disponível para esse aporte.",
      );
    }

    await createTransferLegs(tx, userId, {
      fromAccountId: parentId,
      toAccountId: bucket.id,
      amountCents: movement.amountCents,
      date: fromISODate(movement.date),
      description: `Aporte · ${bucket.name}`,
    });
  });
}

export async function withdrawFromGoal(movement: GoalMovement): Promise<void> {
  const userId = await requireUserId();

  await prisma.$transaction(async (tx) => {
    const { bucket, parentId } = await requireBucket(tx, userId, movement.goalId);
    const balance = await accountBalance(tx, bucket.id);

    if (balance < movement.amountCents) {
      throw new GoalServiceError(
        "INSUFFICIENT_BUCKET_BALANCE",
        "A caixinha não tem esse saldo para resgatar.",
      );
    }

    await createTransferLegs(tx, userId, {
      fromAccountId: bucket.id,
      toAccountId: parentId,
      amountCents: movement.amountCents,
      date: fromISODate(movement.date),
      description: `Resgate · ${bucket.name}`,
    });
  });
}

/**
 * Rendimento é dinheiro novo entrando no patrimônio: uma entrada só, sem perna oposta,
 * categorizada como sistema. É o único lançamento que não é transferência dentro de uma
 * caixinha.
 */
export async function registerYield(movement: GoalMovement): Promise<void> {
  await registerYieldBatch({
    goalId: movement.goalId,
    entries: [{ month: monthOf(movement.date), amountCents: movement.amountCents }],
  });
}

export async function registerYieldBatch(batch: YieldBatch): Promise<number> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const { bucket } = await requireBucket(tx, userId, batch.goalId);
    const categoryId = await yieldCategoryId(tx, userId);

    for (const entry of batch.entries) {
      const [year, month] = entry.month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

      await tx.transaction.create({
        data: {
          userId,
          accountId: bucket.id,
          categoryId,
          date: fromZonedParts({ year, month, day: lastDay }),
          description: `Rendimento · ${bucket.name}`,
          amountCents: entry.amountCents,
          type: "INCOME",
          provider: "manual",
        },
      });
    }

    return batch.entries.length;
  });
}

/** Resgatar devolve o saldo inteiro para a mãe e arquiva a caixinha, sem apagar nada. */
export async function redeemGoal(goalId: string, date: string): Promise<number> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const { bucket, parentId } = await requireBucket(tx, userId, goalId);
    const balance = await accountBalance(tx, bucket.id);

    if (balance <= 0) {
      throw new GoalServiceError("EMPTY_BUCKET", "A caixinha já está zerada.");
    }

    await createTransferLegs(tx, userId, {
      fromAccountId: bucket.id,
      toAccountId: parentId,
      amountCents: balance,
      date: fromISODate(date),
      description: `Resgate final · ${bucket.name}`,
    });

    await tx.account.update({ where: { id: bucket.id }, data: { archived: true } });
    await tx.goal.update({ where: { id: goalId }, data: { archived: true } });

    return balance;
  });
}

export async function setGoalArchived(goalId: string, archived: boolean): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.goal.updateMany({
    where: { id: goalId, userId },
    data: { archived },
  });

  if (count === 0) throw notFound();
}

/** Categoria de sistema do rendimento. Criada sob demanda para o app nunca ficar sem ela. */
export async function yieldCategoryId(
  client: Prisma.TransactionClient,
  userId: string,
): Promise<string> {
  const existing = await client.category.findFirst({
    where: { userId, name: YIELD_CATEGORY_NAME, isSystem: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await client.category.create({
    data: {
      userId,
      name: YIELD_CATEGORY_NAME,
      kind: "INCOME",
      color: "#0B6E75",
      icon: "chart",
      isSystem: true,
    },
    select: { id: true },
  });

  return created.id;
}

type GoalWithBucket = Prisma.GoalGetPayload<{ include: typeof GOAL_INCLUDE }>;

function toDetail(goal: GoalWithBucket, reference: Date): GoalDetail {
  const account = goal.bucketAccount;
  const composition = decomposeBucketBalance(
    account?.initialBalanceCents ?? 0,
    account?.transactions ?? [],
  );

  const bucket: GoalBucket | null =
    account && account.parentAccount
      ? {
          accountId: account.id,
          name: account.name,
          parentAccountId: account.parentAccount.id,
          parentAccountName: account.parentAccount.name,
          archived: account.archived,
          ...composition,
        }
      : null;

  const yearlyRate = goal.expectedYearlyRatePercent ? Number(goal.expectedYearlyRatePercent) : null;

  // Só aporte conta como ritmo: rendimento não é esforço de poupança.
  const deposits: Contribution[] = (account?.transactions ?? [])
    .filter((entry) => entry.type === "TRANSFER" && entry.amountCents > 0)
    .map((entry) => ({ date: entry.date, amountCents: entry.amountCents }));

  const pace = buildGoalPace(
    composition.balanceCents,
    goal.targetCents,
    goal.targetDate,
    deposits,
    reference,
    yearlyRate,
  );

  return {
    id: goal.id,
    name: goal.name,
    color: goal.color,
    icon: goal.icon,
    targetCents: goal.targetCents,
    targetDate: goal.targetDate,
    archived: goal.archived,
    expectedYearlyRatePercent: yearlyRate,
    bucket,
    pace,
    series: buildGoalSeries(
      monthlyBalance(account?.initialBalanceCents ?? 0, account?.transactions ?? [], reference),
      pace,
      reference,
      monthKey(toDateParts(goal.targetDate)),
      yearlyRate,
    ),
    movements: (account?.transactions ?? []).map(toMovement),
  };
}

function toMovement(entry: {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  type: string;
}): GoalMovementRow {
  return {
    id: entry.id,
    date: entry.date,
    description: entry.description,
    amountCents: entry.amountCents,
    kind: entry.type === "INCOME" ? "rendimento" : entry.amountCents >= 0 ? "aporte" : "resgate",
  };
}

/** Saldo acumulado da caixinha mês a mês, que é o que a curva da meta desenha. */
function monthlyBalance(
  initialBalanceCents: number,
  entries: readonly { date: Date; amountCents: number }[],
  reference: Date,
): { month: string; savedCents: number }[] {
  const current = monthKey(toDateParts(reference));
  if (entries.length === 0) return [{ month: current, savedCents: initialBalanceCents }];

  const deltas = new Map<string, number>();
  for (const entry of entries) {
    const key = monthKey(toDateParts(entry.date));
    deltas.set(key, (deltas.get(key) ?? 0) + entry.amountCents);
  }

  const months = [...new Set([...deltas.keys(), current])]
    .filter((month) => month <= current)
    .sort();
  let running = initialBalanceCents;

  return months.map((month) => {
    running += deltas.get(month) ?? 0;
    return { month, savedCents: running };
  });
}

async function requireBucket(
  client: Prisma.TransactionClient,
  userId: string,
  goalId: string,
): Promise<{ bucket: { id: string; name: string }; parentId: string }> {
  const goal = await client.goal.findFirst({
    where: { id: goalId, userId },
    select: {
      bucketAccount: { select: { id: true, name: true, parentAccountId: true, archived: true } },
    },
  });

  if (!goal) throw notFound();
  if (!goal.bucketAccount?.parentAccountId) {
    throw new GoalServiceError(
      "NO_BUCKET",
      "Esta meta ainda não tem caixinha. Crie a caixinha para movimentar dinheiro.",
    );
  }

  return {
    bucket: { id: goal.bucketAccount.id, name: goal.bucketAccount.name },
    parentId: goal.bucketAccount.parentAccountId,
  };
}

async function accountBalance(
  client: Prisma.TransactionClient,
  accountId: string,
): Promise<number> {
  const [account, movement] = await Promise.all([
    client.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { initialBalanceCents: true },
    }),
    client.transaction.aggregate({ where: { accountId }, _sum: { amountCents: true } }),
  ]);

  return account.initialBalanceCents + (movement._sum.amountCents ?? 0);
}

async function createTransferLegs(
  client: Prisma.TransactionClient,
  userId: string,
  input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    date: Date;
    description: string;
  },
): Promise<void> {
  const transferGroupId = crypto.randomUUID();

  await client.transaction.createMany({
    data: [
      {
        userId,
        accountId: input.fromAccountId,
        date: input.date,
        description: input.description,
        amountCents: -input.amountCents,
        type: "TRANSFER",
        transferGroupId,
        provider: "manual",
      },
      {
        userId,
        accountId: input.toAccountId,
        date: input.date,
        description: input.description,
        amountCents: input.amountCents,
        type: "TRANSFER",
        transferGroupId,
        provider: "manual",
      },
    ],
  });
}

function toGoalData(input: GoalInput) {
  return {
    name: input.name,
    targetCents: input.targetCents,
    targetDate: fromISODate(input.targetDate),
    color: input.color,
    icon: input.icon,
    expectedYearlyRatePercent: input.expectedYearlyRatePercent,
  };
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function fromISODate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return fromZonedParts({ year, month, day });
}

function notFound(): GoalServiceError {
  return new GoalServiceError("NOT_FOUND", "Meta não encontrada.");
}
