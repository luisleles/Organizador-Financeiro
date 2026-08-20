import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { applyGoalMigration, listPendingGoalMigrations } from "./goal.migration";

const DATA = new Date("2026-08-19T03:00:00.000Z");

let userId: string;
let parentId: string;

async function balanceOf(accountId: string): Promise<number> {
  const [account, movement] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { initialBalanceCents: true },
    }),
    prisma.transaction.aggregate({ where: { accountId }, _sum: { amountCents: true } }),
  ]);
  return account.initialBalanceCents + (movement._sum.amountCents ?? 0);
}

async function consolidated(): Promise<number> {
  const accounts = await prisma.account.findMany({ select: { id: true } });
  const balances = await Promise.all(accounts.map((account) => balanceOf(account.id)));
  return balances.reduce((total, balance) => total + balance, 0);
}

/** Recria o snapshot que a migração de schema deixa para trás. */
async function seedSnapshot(goalId: string, name: string, totalCents: number) {
  await prisma.$executeRawUnsafe(
    'INSERT OR REPLACE INTO "_GoalBucketMigration" ("goalId","goalName","previousAccountId","contributionCount","totalContributedCents","resolution","resolvedAt") VALUES (?,?,?,?,?,NULL,NULL)',
    goalId,
    name,
    parentId,
    2,
    totalCents,
  );
}

async function seedGoal(name: string): Promise<string> {
  const goal = await prisma.goal.create({
    data: {
      userId,
      name,
      targetCents: 2000000,
      targetDate: new Date("2027-06-30T03:00:00.000Z"),
      color: "#0B6E75",
      icon: "piggy-bank",
    },
  });
  return goal.id;
}

beforeAll(async () => {
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_GoalBucketMigration" (
    "goalId" TEXT NOT NULL PRIMARY KEY,
    "goalName" TEXT NOT NULL,
    "previousAccountId" TEXT,
    "contributionCount" INTEGER NOT NULL,
    "totalContributedCents" INTEGER NOT NULL,
    "resolution" TEXT,
    "resolvedAt" DATETIME
  )`);

  await prisma.transaction.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "mig@example.com", passwordHash: "x" },
  });
  userId = user.id;
});

beforeEach(async () => {
  await prisma.$executeRawUnsafe('DELETE FROM "_GoalBucketMigration"');
  await prisma.transaction.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.account.deleteMany({ where: { parentAccountId: { not: null } } });
  await prisma.account.deleteMany();

  const parent = await prisma.account.create({
    data: {
      userId,
      name: "Poupança",
      type: "SAVINGS",
      class: "ASSET",
      initialBalanceCents: 500000,
      color: "#0B6E75",
      icon: "piggy-bank",
    },
  });
  parentId = parent.id;
});

describe("caso (a): a conta mãe já estava descontada", () => {
  it("grava o total como saldo inicial da caixinha, sem tocar na mãe", async () => {
    const goalId = await seedGoal("Reserva");
    await seedSnapshot(goalId, "Reserva", 380000);

    const outcome = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "initial",
      date: DATA,
    });

    expect(outcome.action).toBe("created");
    expect(await balanceOf(parentId)).toBe(500000);
    expect(await balanceOf(outcome.bucketAccountId as string)).toBe(380000);
    expect(await prisma.transaction.count()).toBe(0);
  });
});

describe("caso (b): a conta mãe ainda inclui o dinheiro", () => {
  it("cria uma transferência consolidada e o patrimônio não muda", async () => {
    const goalId = await seedGoal("Reserva");
    await seedSnapshot(goalId, "Reserva", 380000);
    const antes = await consolidated();

    const outcome = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "transfer",
      date: DATA,
    });

    expect(await balanceOf(parentId)).toBe(120000);
    expect(await balanceOf(outcome.bucketAccountId as string)).toBe(380000);
    expect(await consolidated()).toBe(antes);
    expect(await prisma.transaction.count()).toBe(2);
  });

  it("recusa quando a transferência deixaria a conta mãe negativa", async () => {
    const goalId = await seedGoal("Grande demais");
    await seedSnapshot(goalId, "Grande demais", 900000);

    const outcome = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "transfer",
      date: DATA,
    });

    expect(outcome.action).toBe("skipped");
    expect(await balanceOf(parentId)).toBe(500000);
    expect(await prisma.account.count({ where: { type: "SAVINGS_BUCKET" } })).toBe(0);
  });
});

describe("idempotência", () => {
  it("rodar duas vezes no caso (a) produz o mesmo resultado", async () => {
    const goalId = await seedGoal("Reserva");
    await seedSnapshot(goalId, "Reserva", 380000);

    const primeira = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "initial",
      date: DATA,
    });
    const segunda = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "initial",
      date: DATA,
    });

    expect(primeira.action).toBe("created");
    expect(segunda.action).toBe("skipped");
    expect(await prisma.account.count({ where: { type: "SAVINGS_BUCKET" } })).toBe(1);
    expect(await balanceOf(primeira.bucketAccountId as string)).toBe(380000);
  });

  it("rodar duas vezes no caso (b) não duplica a transferência", async () => {
    const goalId = await seedGoal("Reserva");
    await seedSnapshot(goalId, "Reserva", 380000);

    const primeira = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "transfer",
      date: DATA,
    });
    await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "transfer",
      date: DATA,
    });

    expect(await prisma.transaction.count()).toBe(2);
    expect(await balanceOf(parentId)).toBe(120000);
    expect(await balanceOf(primeira.bucketAccountId as string)).toBe(380000);
  });
});

describe("casos de borda", () => {
  it("meta sem aporte vira caixinha vazia, sem transferência", async () => {
    const goalId = await seedGoal("Nova");
    await seedSnapshot(goalId, "Nova", 0);

    const outcome = await applyGoalMigration({
      goalId,
      parentAccountId: parentId,
      decision: "transfer",
      date: DATA,
    });

    expect(outcome.resolution).toBe("empty");
    expect(await prisma.transaction.count()).toBe(0);
  });

  it("recusa conta mãe que é cartão", async () => {
    const card = await prisma.account.create({
      data: {
        userId,
        name: "Cartão",
        type: "CREDIT_CARD",
        class: "LIABILITY",
        initialBalanceCents: 0,
        color: "#B0234A",
        icon: "credit-card",
      },
    });
    const goalId = await seedGoal("Reserva");
    await seedSnapshot(goalId, "Reserva", 100000);

    const outcome = await applyGoalMigration({
      goalId,
      parentAccountId: card.id,
      decision: "initial",
      date: DATA,
    });

    expect(outcome.action).toBe("skipped");
    expect(outcome.reason).toContain("conta mãe inválida");
  });

  it("lista o que ainda está pendente com o nome da conta anterior", async () => {
    const goalId = await seedGoal("Reserva");
    await seedSnapshot(goalId, "Reserva", 380000);

    const [pending] = await listPendingGoalMigrations();

    expect(pending.goalName).toBe("Reserva");
    expect(pending.totalContributedCents).toBe(380000);
    expect(pending.previousAccountName).toBe("Poupança");
    expect(pending.resolution).toBeNull();
  });
});
