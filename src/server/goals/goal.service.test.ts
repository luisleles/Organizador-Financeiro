import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { splitParentBalance } from "@/server/accounts/account.buckets";
import { getMonthlyBudgets, setBudget } from "@/server/budgets/budget.service";
import { createTransfer } from "@/server/transactions/transaction.service";
import {
  GoalServiceError,
  createBucketForGoal,
  createGoal,
  depositToGoal,
  listGoals,
  redeemGoal,
  registerYieldBatch,
  withdrawFromGoal,
} from "./goal.service";

const HOJE = "2026-08-19";
const AGOSTO: ResolvedPeriod = {
  start: new Date("2026-08-01T03:00:00.000Z"),
  end: new Date("2026-09-01T02:59:59.999Z"),
  label: "agosto de 2026",
};

let userId: string;
let parentId: string;
let otherAccountId: string;
let cardId: string;
let goalId: string;

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

/** Patrimônio: soma de todas as contas. Caixinha entra uma vez, como qualquer conta. */
async function consolidated(): Promise<number> {
  const accounts = await prisma.account.findMany({ select: { id: true } });
  const balances = await Promise.all(accounts.map((account) => balanceOf(account.id)));
  return balances.reduce((total, balance) => total + balance, 0);
}

async function newGoal(targetReais = 10000): Promise<string> {
  return createGoal({
    name: "Reserva",
    targetCents: targetReais * 100,
    targetDate: "2027-06-30",
    color: "#0B6E75",
    icon: "piggy-bank",
    expectedYearlyRatePercent: null,
  });
}

beforeAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "bucket@example.com", passwordHash: "x" },
  });
  userId = user.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.goal.deleteMany();
  await prisma.account.deleteMany({ where: { parentAccountId: { not: null } } });
  await prisma.account.deleteMany();
  await prisma.category.deleteMany();

  const [parent, other, card] = await Promise.all([
    prisma.account.create({
      data: {
        userId,
        name: "Poupança",
        type: "SAVINGS",
        class: "ASSET",
        initialBalanceCents: 500000,
        color: "#0B6E75",
        icon: "piggy-bank",
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Corrente",
        type: "CHECKING",
        class: "ASSET",
        initialBalanceCents: 100000,
        color: "#2653D9",
        icon: "landmark",
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Cartão",
        type: "CREDIT_CARD",
        class: "LIABILITY",
        initialBalanceCents: 0,
        color: "#B0234A",
        icon: "credit-card",
        creditCardDetails: { create: { closingDay: 20, dueDay: 28, creditLimitCents: 500000 } },
      },
    }),
  ]);

  parentId = parent.id;
  otherAccountId = other.id;
  cardId = card.id;
  goalId = await newGoal();
  await createBucketForGoal(goalId, parentId);
});

async function bucketId(): Promise<string> {
  const goal = await prisma.goal.findUniqueOrThrow({
    where: { id: goalId },
    select: { bucketAccountId: true },
  });
  return goal.bucketAccountId as string;
}

describe("criação da caixinha", () => {
  it("nasce como subconta de ativo da conta mãe", async () => {
    const bucket = await prisma.account.findUniqueOrThrow({ where: { id: await bucketId() } });

    expect(bucket.type).toBe("SAVINGS_BUCKET");
    expect(bucket.class).toBe("ASSET");
    expect(bucket.parentAccountId).toBe(parentId);
    expect(bucket.initialBalanceCents).toBe(0);
  });

  it("recusa cartão como conta mãe", async () => {
    const outra = await newGoal();

    await expect(createBucketForGoal(outra, cardId)).rejects.toMatchObject({
      code: "PARENT_MUST_BE_ASSET",
    });
  });

  it("recusa caixinha dentro de caixinha", async () => {
    const outra = await newGoal();

    await expect(createBucketForGoal(outra, await bucketId())).rejects.toMatchObject({
      code: "PARENT_IS_BUCKET",
    });
  });

  it("recusa segunda caixinha para a mesma meta", async () => {
    await expect(createBucketForGoal(goalId, parentId)).rejects.toMatchObject({
      code: "BUCKET_EXISTS",
    });
  });

  it("meta sem caixinha é válida, com progresso zero", async () => {
    const planejada = await newGoal();
    const { planning } = await listGoals(new Date(`${HOJE}T15:00:00Z`));
    const detail = planning.find((goal) => goal.id === planejada);

    expect(detail?.bucket).toBeNull();
    expect(detail?.pace.savedCents).toBe(0);
  });
});

describe("aporte", () => {
  it("recusa depósito acima do saldo da conta mãe", async () => {
    await expect(depositToGoal({ goalId, amountCents: 900000, date: HOJE })).rejects.toMatchObject({
      code: "INSUFFICIENT_PARENT_BALANCE",
    });
  });

  it("não altera o patrimônio consolidado", async () => {
    const antes = await consolidated();
    await depositToGoal({ goalId, amountCents: 120000, date: HOJE });

    expect(await consolidated()).toBe(antes);
  });

  it("move o dinheiro da mãe para a caixinha", async () => {
    await depositToGoal({ goalId, amountCents: 120000, date: HOJE });

    expect(await balanceOf(parentId)).toBe(380000);
    expect(await balanceOf(await bucketId())).toBe(120000);
  });

  it("gera duas pernas de transferência ligadas", async () => {
    await depositToGoal({ goalId, amountCents: 120000, date: HOJE });
    const legs = await prisma.transaction.findMany({ where: { type: "TRANSFER" } });

    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((leg) => leg.transferGroupId)).size).toBe(1);
    expect(legs.reduce((total, leg) => total + leg.amountCents, 0)).toBe(0);
    expect(legs.every((leg) => leg.categoryId === null)).toBe(true);
  });
});

describe("rendimento", () => {
  it("aumenta o patrimônio consolidado", async () => {
    const antes = await consolidated();
    await registerYieldBatch({ goalId, entries: [{ month: "2026-08", amountCents: 2780 }] });

    expect(await consolidated()).toBe(antes + 2780);
  });

  it("entra como receita, com a categoria de sistema", async () => {
    await registerYieldBatch({ goalId, entries: [{ month: "2026-08", amountCents: 2780 }] });
    const entry = await prisma.transaction.findFirstOrThrow({
      where: { type: "INCOME" },
      include: { category: true },
    });

    expect(entry.amountCents).toBe(2780);
    expect(entry.category?.name).toBe("Rendimentos");
    expect(entry.category?.isSystem).toBe(true);
    expect(entry.transferGroupId).toBeNull();
  });

  it("não conta como aporte no progresso da meta", async () => {
    await depositToGoal({ goalId, amountCents: 100000, date: HOJE });
    await registerYieldBatch({ goalId, entries: [{ month: "2026-08", amountCents: 2780 }] });

    const { active } = await listGoals(new Date(`${HOJE}T15:00:00Z`));
    const detail = active.find((goal) => goal.id === goalId);

    expect(detail?.bucket?.balanceCents).toBe(102780);
    expect(detail?.bucket?.totalDepositedCents).toBe(100000);
    expect(detail?.bucket?.totalYieldCents).toBe(2780);
  });

  it("aceita lançamento em lote, um valor por mês", async () => {
    const created = await registerYieldBatch({
      goalId,
      entries: [
        { month: "2026-06", amountCents: 1000 },
        { month: "2026-07", amountCents: 1100 },
        { month: "2026-08", amountCents: 1200 },
      ],
    });

    expect(created).toBe(3);
    expect(await balanceOf(await bucketId())).toBe(3300);
  });
});

describe("caixinha só movimenta com a conta mãe", () => {
  it("recusa transferência para outra conta", async () => {
    await depositToGoal({ goalId, amountCents: 100000, date: HOJE });

    await expect(
      createTransfer({
        date: HOJE,
        description: "fuga",
        amountCents: 1000,
        fromAccountId: await bucketId(),
        toAccountId: otherAccountId,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "BUCKET_RULE" });
  });

  it("recusa transferência entre duas caixinhas", async () => {
    const outra = await newGoal();
    await createBucketForGoal(outra, parentId);
    const outraBucket = await prisma.goal.findUniqueOrThrow({
      where: { id: outra },
      select: { bucketAccountId: true },
    });

    await expect(
      createTransfer({
        date: HOJE,
        description: "entre caixinhas",
        amountCents: 1000,
        fromAccountId: await bucketId(),
        toAccountId: outraBucket.bucketAccountId as string,
        notes: null,
      }),
    ).rejects.toMatchObject({ code: "BUCKET_RULE" });
  });
});

describe("orçamento", () => {
  it("transferência para caixinha não consome orçamento", async () => {
    const categoria = await prisma.category.create({
      data: { userId, name: "Casa", kind: "EXPENSE", color: "#A85B12", icon: "home" },
    });
    await setBudget({ categoryId: categoria.id, month: "2026-08", limitCents: 100000 });
    await depositToGoal({ goalId, amountCents: 90000, date: HOJE });

    const { rows } = await getMonthlyBudgets("2026-08", new Date(`${HOJE}T15:00:00Z`));

    expect(rows[0].progress.spentCents).toBe(0);
  });
});

describe("resgate", () => {
  it("devolve o saldo exato e faz a meta regredir", async () => {
    await depositToGoal({ goalId, amountCents: 200000, date: HOJE });
    await registerYieldBatch({ goalId, entries: [{ month: "2026-08", amountCents: 5000 }] });

    const resgatado = await redeemGoal(goalId, HOJE);

    expect(resgatado).toBe(205000);
    expect(await balanceOf(await bucketId())).toBe(0);
    expect(await balanceOf(parentId)).toBe(505000);
  });

  it("arquiva a caixinha sem apagar o histórico", async () => {
    await depositToGoal({ goalId, amountCents: 200000, date: HOJE });
    await redeemGoal(goalId, HOJE);

    const bucket = await prisma.account.findUniqueOrThrow({ where: { id: await bucketId() } });
    const historico = await prisma.transaction.count({ where: { accountId: bucket.id } });

    expect(bucket.archived).toBe(true);
    expect(historico).toBeGreaterThan(0);
  });

  it("recusa resgatar caixinha vazia", async () => {
    await expect(redeemGoal(goalId, HOJE)).rejects.toBeInstanceOf(GoalServiceError);
  });

  it("resgate parcial devolve só o pedido", async () => {
    await depositToGoal({ goalId, amountCents: 200000, date: HOJE });
    await withdrawFromGoal({ goalId, amountCents: 50000, date: HOJE });

    expect(await balanceOf(await bucketId())).toBe(150000);
    expect(await balanceOf(parentId)).toBe(350000);
  });
});

describe("saldo da conta mãe", () => {
  it("disponível mais caixinhas dá o total, sem dupla contagem", async () => {
    await depositToGoal({ goalId, amountCents: 120000, date: HOJE });

    const disponivel = await balanceOf(parentId);
    const naCaixinha = await balanceOf(await bucketId());
    const split = splitParentBalance(disponivel, [naCaixinha]);

    expect(split.availableCents).toBe(380000);
    expect(split.bucketsCents).toBe(120000);
    expect(split.totalCents).toBe(500000);
    expect(split.totalCents).toBe(await consolidated().then((total) => total - 100000));
  });
});

describe("período usado nos testes", () => {
  it("cobre agosto de 2026", () => {
    expect(AGOSTO.start.getUTCMonth()).toBe(7);
  });
});
