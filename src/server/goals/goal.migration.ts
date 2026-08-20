import { fromZonedParts } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { BUCKET_TYPE } from "@/server/accounts/account.buckets";

/**
 * Materializa as metas antigas como caixinhas. A decisão de **onde o dinheiro estava** não
 * pode ser inferida: dependendo de como a pessoa usava o app, o saldo da conta mãe já
 * estava descontado dos aportes ou ainda os continha. Escolher sozinho corromperia o
 * patrimônio em silêncio, então cada meta precisa de uma resposta explícita.
 */

export type MigrationCase =
  /** A conta mãe JÁ estava descontada: o dinheiro vira saldo inicial da caixinha. */
  | "initial"
  /** A conta mãe AINDA inclui o dinheiro: cria uma transferência consolidada. */
  | "transfer"
  /** Sem aporte nenhum: só cria a caixinha vazia. */
  | "empty";

export type PendingGoalMigration = {
  goalId: string;
  goalName: string;
  previousAccountId: string | null;
  previousAccountName: string | null;
  contributionCount: number;
  totalContributedCents: number;
  resolution: MigrationCase | null;
};

export type MigrationOutcome = {
  goalId: string;
  goalName: string;
  action: "skipped" | "created";
  resolution: MigrationCase | null;
  bucketAccountId: string | null;
  amountCents: number;
  reason?: string;
};

type SnapshotRow = {
  goalId: string;
  goalName: string;
  previousAccountId: string | null;
  contributionCount: number;
  totalContributedCents: number;
  resolution: MigrationCase | null;
};

export async function listPendingGoalMigrations(): Promise<PendingGoalMigration[]> {
  const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
    'SELECT "goalId", "goalName", "previousAccountId", "contributionCount", "totalContributedCents", "resolution" FROM "_GoalBucketMigration" ORDER BY "goalName"',
  );

  const accountIds = rows
    .map((row) => row.previousAccountId)
    .filter((id): id is string => id !== null);

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(accounts.map((account) => [account.id, account.name]));

  return rows.map((row) => ({
    ...row,
    contributionCount: Number(row.contributionCount),
    totalContributedCents: Number(row.totalContributedCents),
    previousAccountName: row.previousAccountId
      ? (nameById.get(row.previousAccountId) ?? null)
      : null,
  }));
}

/**
 * Idempotente por construção: uma meta que já tem caixinha, ou já foi resolvida no
 * snapshot, é pulada. Rodar duas vezes produz exatamente o mesmo banco.
 */
export async function applyGoalMigration(input: {
  goalId: string;
  parentAccountId: string;
  decision: MigrationCase;
  date: Date;
}): Promise<MigrationOutcome> {
  return prisma.$transaction(async (tx) => {
    const [snapshot] = await tx.$queryRawUnsafe<SnapshotRow[]>(
      'SELECT "goalId", "goalName", "previousAccountId", "contributionCount", "totalContributedCents", "resolution" FROM "_GoalBucketMigration" WHERE "goalId" = ?',
      input.goalId,
    );

    const goal = await tx.goal.findUnique({
      where: { id: input.goalId },
      select: {
        id: true,
        name: true,
        userId: true,
        color: true,
        icon: true,
        bucketAccountId: true,
      },
    });

    if (!snapshot || !goal) {
      return skipped(input.goalId, snapshot?.goalName ?? "?", "meta não existe mais");
    }
    if (snapshot.resolution !== null || goal.bucketAccountId !== null) {
      return skipped(goal.id, goal.name, "já migrada");
    }

    const total = Number(snapshot.totalContributedCents);
    const decision: MigrationCase = total === 0 ? "empty" : input.decision;

    const parent = await tx.account.findFirst({
      where: { id: input.parentAccountId, userId: goal.userId },
      select: { id: true, class: true, type: true, initialBalanceCents: true },
    });
    if (!parent || parent.class !== "ASSET" || parent.type === BUCKET_TYPE) {
      return skipped(goal.id, goal.name, "conta mãe inválida");
    }

    if (decision === "transfer") {
      const movement = await tx.transaction.aggregate({
        where: { accountId: parent.id },
        _sum: { amountCents: true },
      });
      const available = parent.initialBalanceCents + (movement._sum.amountCents ?? 0);

      // A transferência é datada de hoje, então só o saldo de hoje pode ficar negativo —
      // e não vamos deixar.
      if (available < total) {
        return skipped(
          goal.id,
          goal.name,
          `conta mãe tem ${available} e a transferência precisa de ${total}`,
        );
      }
    }

    const bucket = await tx.account.create({
      data: {
        userId: goal.userId,
        name: goal.name,
        type: BUCKET_TYPE,
        class: "ASSET",
        initialBalanceCents: decision === "initial" ? total : 0,
        color: goal.color,
        icon: goal.icon,
        parentAccountId: parent.id,
      },
      select: { id: true },
    });

    if (decision === "transfer") {
      const transferGroupId = crypto.randomUUID();
      await tx.transaction.createMany({
        data: [
          {
            userId: goal.userId,
            accountId: parent.id,
            date: input.date,
            description: `Migração · ${goal.name}`,
            amountCents: -total,
            type: "TRANSFER",
            transferGroupId,
            provider: "migration",
          },
          {
            userId: goal.userId,
            accountId: bucket.id,
            date: input.date,
            description: `Migração · ${goal.name}`,
            amountCents: total,
            type: "TRANSFER",
            transferGroupId,
            provider: "migration",
          },
        ],
      });
    }

    await tx.goal.update({ where: { id: goal.id }, data: { bucketAccountId: bucket.id } });
    await tx.$executeRawUnsafe(
      'UPDATE "_GoalBucketMigration" SET "resolution" = ?, "resolvedAt" = ? WHERE "goalId" = ?',
      decision,
      new Date().toISOString(),
      goal.id,
    );

    return {
      goalId: goal.id,
      goalName: goal.name,
      action: "created",
      resolution: decision,
      bucketAccountId: bucket.id,
      amountCents: total,
    };
  });
}

export function migrationDate(reference: Date = new Date()): Date {
  const parts = {
    year: reference.getUTCFullYear(),
    month: reference.getUTCMonth() + 1,
    day: reference.getUTCDate(),
  };
  return fromZonedParts(parts);
}

function skipped(goalId: string, goalName: string, reason: string): MigrationOutcome {
  return {
    goalId,
    goalName,
    action: "skipped",
    resolution: null,
    bucketAccountId: null,
    amountCents: 0,
    reason,
  };
}
