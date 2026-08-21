import {
  AccountClass,
  AccountType,
  CategoryKind,
  RecurringFrequency,
  TransactionType,
} from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/server/auth/password";
import { toCents } from "../src/lib/money";
import { invoiceScheduleForPurchase } from "../src/server/accounts/account.credit-card";
import { YIELD_CATEGORY_NAME } from "../src/server/categories/system-categories";

/**
 * Gerador pseudoaleatório determinístico (mulberry32), para que o seed produza sempre
 * os mesmos dados a cada execução — útil para comparar diffs e depurar.
 */
function createRng(seed: number) {
  let state = seed;
  return function rng() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = createRng(20260818);

function randomInt(min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function chance(probability: number): boolean {
  return rng() < probability;
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(0, items.length - 1)];
}

function randomCentsBetween(minReais: number, maxReais: number): number {
  const reais = minReais + rng() * (maxReais - minReais);
  return Math.round(reais * 100);
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function utcDate(year: number, monthIndex: number, day: number, hour = 12): Date {
  const clampedDay = Math.min(day, daysInMonth(year, monthIndex));
  return new Date(Date.UTC(year, monthIndex, clampedDay, hour));
}

function randomDayInMonth(year: number, monthIndex: number): number {
  return randomInt(1, daysInMonth(year, monthIndex));
}

type MonthWindow = { year: number; monthIndex: number };

function lastNMonths(n: number, reference = new Date()): MonthWindow[] {
  const months: MonthWindow[] = [];
  for (let offset = n - 1; offset >= 0; offset--) {
    const cursor = new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() - offset, 1),
    );
    months.push({ year: cursor.getUTCFullYear(), monthIndex: cursor.getUTCMonth() });
  }
  return months;
}

type CategorySeed = {
  name: string;
  color: string;
  icon: string;
  children?: Omit<CategorySeed, "children">[];
};

const INCOME_CATEGORIES: CategorySeed[] = [
  {
    name: "Salário",
    color: "#16A34A",
    icon: "wallet",
    children: [
      { name: "Salário CLT", color: "#16A34A", icon: "wallet" },
      { name: "Freelance", color: "#22C55E", icon: "laptop" },
    ],
  },
  { name: "Investimentos", color: "#0D9488", icon: "trending-up" },
  { name: "Outras receitas", color: "#65A30D", icon: "circle-dollar-sign" },
];

const EXPENSE_CATEGORIES: CategorySeed[] = [
  {
    name: "Moradia",
    color: "#DC2626",
    icon: "home",
    children: [
      { name: "Aluguel", color: "#DC2626", icon: "home" },
      { name: "Contas de casa", color: "#EF4444", icon: "receipt" },
    ],
  },
  {
    name: "Alimentação",
    color: "#EA580C",
    icon: "utensils",
    children: [
      { name: "Supermercado", color: "#EA580C", icon: "shopping-cart" },
      { name: "Restaurante", color: "#F97316", icon: "utensils" },
    ],
  },
  {
    name: "Transporte",
    color: "#CA8A04",
    icon: "car",
    children: [
      { name: "Combustível", color: "#CA8A04", icon: "fuel" },
      { name: "Transporte por app", color: "#EAB308", icon: "car" },
    ],
  },
  {
    name: "Saúde",
    color: "#DB2777",
    icon: "heart-pulse",
    children: [
      { name: "Farmácia", color: "#DB2777", icon: "pill" },
      { name: "Plano de saúde", color: "#E11D48", icon: "heart-pulse" },
    ],
  },
  {
    name: "Lazer",
    color: "#7C3AED",
    icon: "party-popper",
    children: [
      { name: "Streaming", color: "#7C3AED", icon: "tv" },
      { name: "Compras pessoais", color: "#9333EA", icon: "shopping-bag" },
    ],
  },
  { name: "Educação", color: "#2563EB", icon: "graduation-cap" },
];

const SUPERMERCADOS = ["Supermercado Extra", "Pão de Açúcar", "Carrefour", "Assaí Atacadista"];
const RESTAURANTES = ["Restaurante Sabor Caseiro", "iFood", "Outback Steakhouse", "Sushi Yassu"];
const POSTOS = ["Posto Ipiranga", "Posto Shell", "Posto BR Mania"];
const APPS_TRANSPORTE = ["Uber", "99"];
const FARMACIAS = ["Drogasil", "Drogaria São Paulo", "Farmácia Pague Menos"];
const LOJAS = ["Renner", "C&A", "Amazon", "Mercado Livre"];
const CURSOS = ["Curso Alura", "Curso Udemy", "Material didático"];

/**
 * O único usuário do app. A senha vem de `SEED_PASSWORD` ou é sorteada e impressa uma vez —
 * senha fixa em código versionado seria uma senha pública.
 */
async function seedUser() {
  const email = process.env.SEED_EMAIL ?? "usuario@example.com";
  const password = process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");

  const user = await prisma.user.create({
    data: {
      name: process.env.SEED_NAME ?? "Usuário Demo",
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
    },
  });

  if (!process.env.SEED_PASSWORD) {
    console.log(
      `\nAcesso criado: ${email}\nSenha sorteada: ${password}\nAnote agora — ela não é exibida de novo.\n`,
    );
  }

  return user;
}

async function seedAccounts(userId: string) {
  const [nubank, bancoDoBrasil, poupancaCaixa, cartaoInter] = await Promise.all([
    prisma.account.create({
      data: {
        userId,
        name: "Nubank",
        institution: "Nubank",
        type: AccountType.CHECKING,
        class: "ASSET",
        initialBalanceCents: toCents(3200),
        color: "#8A05BE",
        icon: "landmark",
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Banco do Brasil",
        institution: "Banco do Brasil",
        type: AccountType.CHECKING,
        class: "ASSET",
        initialBalanceCents: toCents(3000),
        color: "#F9C80E",
        icon: "landmark",
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Poupança Caixa",
        institution: "Caixa Econômica Federal",
        type: AccountType.SAVINGS,
        class: "ASSET",
        initialBalanceCents: toCents(5000),
        color: "#0070AE",
        icon: "piggy-bank",
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Cartão Inter",
        institution: "Banco Inter",
        type: AccountType.CREDIT_CARD,
        class: "LIABILITY",
        initialBalanceCents: 0,
        color: "#FF7A00",
        icon: "credit-card",
        creditCardDetails: {
          create: { closingDay: 20, dueDay: 28, creditLimitCents: toCents(6000) },
        },
      },
    }),
  ]);

  return { nubank, bancoDoBrasil, poupancaCaixa, cartaoInter };
}

async function seedCategories(userId: string) {
  const categoryIdByName = new Map<string, string>();

  async function createTree(nodes: CategorySeed[], kind: CategoryKind) {
    for (const node of nodes) {
      const parent = await prisma.category.create({
        data: { userId, name: node.name, kind, color: node.color, icon: node.icon },
      });
      categoryIdByName.set(node.name, parent.id);

      for (const child of node.children ?? []) {
        const created = await prisma.category.create({
          data: {
            userId,
            name: child.name,
            kind,
            color: child.color,
            icon: child.icon,
            parentId: parent.id,
          },
        });
        categoryIdByName.set(child.name, created.id);
      }
    }
  }

  await createTree(INCOME_CATEGORIES, CategoryKind.INCOME);
  await createTree(EXPENSE_CATEGORIES, CategoryKind.EXPENSE);

  return categoryIdByName;
}

async function seedTags(userId: string) {
  const [fixo, parcelado, reembolsavel] = await Promise.all([
    prisma.tag.create({ data: { userId, name: "Fixo", color: "#475569" } }),
    prisma.tag.create({ data: { userId, name: "Parcelado", color: "#B45309" } }),
    prisma.tag.create({ data: { userId, name: "Reembolsável", color: "#0891B2" } }),
  ]);

  return { fixo, parcelado, reembolsavel };
}

type SeedContext = {
  userId: string;
  accounts: Awaited<ReturnType<typeof seedAccounts>>;
  categoryIdByName: Map<string, string>;
  tags: Awaited<ReturnType<typeof seedTags>>;
};

function categoryId(context: SeedContext, name: string): string {
  const id = context.categoryIdByName.get(name);
  if (!id) throw new Error(`Categoria "${name}" não foi semeada`);
  return id;
}

async function createFixedMonthlyTransactions(context: SeedContext, month: MonthWindow) {
  const { userId, accounts, tags } = context;
  const { year, monthIndex } = month;

  await prisma.transaction.create({
    data: {
      userId,
      accountId: accounts.nubank.id,
      categoryId: categoryId(context, "Salário CLT"),
      date: utcDate(year, monthIndex, 5),
      description: "Salário - Empresa XPTO Ltda",
      amountCents: randomCentsBetween(5200, 5600),
      type: TransactionType.INCOME,
      provider: "manual",
    },
  });

  const rent = await prisma.transaction.create({
    data: {
      userId,
      accountId: accounts.nubank.id,
      categoryId: categoryId(context, "Aluguel"),
      date: utcDate(year, monthIndex, 10),
      description: "Aluguel apartamento",
      amountCents: -toCents(1800),
      type: TransactionType.EXPENSE,
      provider: "manual",
    },
  });
  await prisma.transaction.update({
    where: { id: rent.id },
    data: { tags: { connect: [{ id: tags.fixo.id }] } },
  });

  const householdBills: Array<{
    day: number;
    description: string;
    minReais: number;
    maxReais: number;
  }> = [
    { day: 15, description: "Conta de luz - Enel", minReais: 120, maxReais: 220 },
    { day: 18, description: "Conta de água - Sabesp", minReais: 60, maxReais: 110 },
    { day: 20, description: "Internet - Vivo Fibra", minReais: 99.9, maxReais: 99.9 },
  ];
  for (const bill of householdBills) {
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts.bancoDoBrasil.id,
        categoryId: categoryId(context, "Contas de casa"),
        date: utcDate(year, monthIndex, bill.day),
        description: bill.description,
        amountCents: -randomCentsBetween(bill.minReais, bill.maxReais),
        type: TransactionType.EXPENSE,
        provider: "manual",
      },
    });
    await prisma.transaction.update({
      where: { id: created.id },
      data: { tags: { connect: [{ id: tags.fixo.id }] } },
    });
  }

  const healthPlan = await prisma.transaction.create({
    data: {
      userId,
      accountId: accounts.nubank.id,
      categoryId: categoryId(context, "Plano de saúde"),
      date: utcDate(year, monthIndex, 12),
      description: "Plano de saúde - Unimed",
      amountCents: -toCents(489.9),
      type: TransactionType.EXPENSE,
      provider: "manual",
    },
  });
  await prisma.transaction.update({
    where: { id: healthPlan.id },
    data: { tags: { connect: [{ id: tags.fixo.id }] } },
  });

  const subscriptions = [
    { description: "Netflix", amountReais: 39.9 },
    { description: "Spotify", amountReais: 21.9 },
  ];
  for (const subscription of subscriptions) {
    const created = await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts.cartaoInter.id,
        categoryId: categoryId(context, "Streaming"),
        date: utcDate(year, monthIndex, 3),
        description: subscription.description,
        amountCents: -toCents(subscription.amountReais),
        type: TransactionType.EXPENSE,
        provider: "manual",
      },
    });
    await prisma.transaction.update({
      where: { id: created.id },
      data: { tags: { connect: [{ id: tags.fixo.id }] } },
    });
  }
}

async function createVariableTransactions(context: SeedContext, month: MonthWindow) {
  const { userId, accounts, tags } = context;
  const { year, monthIndex } = month;
  const spendingAccounts = [accounts.nubank, accounts.bancoDoBrasil, accounts.cartaoInter];

  async function createExpense(
    categoryName: string,
    description: string,
    minReais: number,
    maxReais: number,
  ) {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: pick(spendingAccounts).id,
        categoryId: categoryId(context, categoryName),
        date: utcDate(year, monthIndex, randomDayInMonth(year, monthIndex)),
        description,
        amountCents: -randomCentsBetween(minReais, maxReais),
        type: TransactionType.EXPENSE,
        provider: "manual",
      },
    });
  }

  for (let i = 0; i < randomInt(4, 7); i++) {
    await createExpense("Supermercado", pick(SUPERMERCADOS), 80, 350);
  }
  for (let i = 0; i < randomInt(3, 5); i++) {
    await createExpense("Restaurante", pick(RESTAURANTES), 35, 150);
  }
  for (let i = 0; i < randomInt(2, 3); i++) {
    await createExpense("Combustível", pick(POSTOS), 150, 300);
  }
  for (let i = 0; i < randomInt(4, 6); i++) {
    await createExpense("Transporte por app", pick(APPS_TRANSPORTE), 12, 55);
  }
  for (let i = 0; i < randomInt(1, 2); i++) {
    await createExpense("Farmácia", pick(FARMACIAS), 20, 180);
  }

  for (let i = 0; i < randomInt(1, 3); i++) {
    const purchase = await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts.cartaoInter.id,
        categoryId: categoryId(context, "Compras pessoais"),
        date: utcDate(year, monthIndex, randomDayInMonth(year, monthIndex)),
        description: pick(LOJAS),
        amountCents: -randomCentsBetween(60, 400),
        type: TransactionType.EXPENSE,
        provider: "manual",
      },
    });
    if (chance(0.3)) {
      await prisma.transaction.update({
        where: { id: purchase.id },
        data: { tags: { connect: [{ id: tags.parcelado.id }] } },
      });
    }
  }

  if (chance(0.3)) {
    await createExpense("Educação", pick(CURSOS), 49.9, 250);
  }

  if (chance(0.3)) {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts.nubank.id,
        categoryId: categoryId(context, "Freelance"),
        date: utcDate(year, monthIndex, randomDayInMonth(year, monthIndex)),
        description: "Freelance - desenvolvimento de site",
        amountCents: randomCentsBetween(300, 1500),
        type: TransactionType.INCOME,
        provider: "manual",
      },
    });
  }

  if (chance(0.7)) {
    await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts.poupancaCaixa.id,
        categoryId: categoryId(context, "Rendimentos"),
        date: utcDate(year, monthIndex, randomDayInMonth(year, monthIndex)),
        description: "Rendimento poupança",
        amountCents: randomCentsBetween(40, 180),
        type: TransactionType.INCOME,
        provider: "manual",
      },
    });
  }

  if (chance(0.2)) {
    const reimbursement = await prisma.transaction.create({
      data: {
        userId,
        accountId: accounts.nubank.id,
        categoryId: categoryId(context, "Outras receitas"),
        date: utcDate(year, monthIndex, randomDayInMonth(year, monthIndex)),
        description: "Reembolso de despesa",
        amountCents: randomCentsBetween(50, 300),
        type: TransactionType.INCOME,
        provider: "manual",
      },
    });
    await prisma.transaction.update({
      where: { id: reimbursement.id },
      data: { tags: { connect: [{ id: tags.reembolsavel.id }] } },
    });
  }
}

async function createTransfer(
  context: SeedContext,
  params: {
    fromAccountId: string;
    toAccountId: string;
    description: string;
    amountCents: number;
    date: Date;
  },
) {
  const transferGroupId = `transfer-${params.date.getTime()}-${randomInt(1000, 9999)}`;

  await prisma.transaction.createMany({
    data: [
      {
        userId: context.userId,
        accountId: params.fromAccountId,
        date: params.date,
        description: params.description,
        amountCents: -params.amountCents,
        type: TransactionType.TRANSFER,
        transferGroupId,
        provider: "manual",
      },
      {
        userId: context.userId,
        accountId: params.toAccountId,
        date: params.date,
        description: params.description,
        amountCents: params.amountCents,
        type: TransactionType.TRANSFER,
        transferGroupId,
        provider: "manual",
      },
    ],
  });
}

async function createMonthlyTransfers(context: SeedContext, month: MonthWindow) {
  const { accounts } = context;
  const { year, monthIndex } = month;

  await createTransfer(context, {
    fromAccountId: accounts.nubank.id,
    toAccountId: accounts.cartaoInter.id,
    description: "Pagamento fatura Cartão Inter",
    amountCents: randomCentsBetween(800, 2200),
    date: utcDate(year, monthIndex, 25),
  });

  // Reposição mensal: o Banco do Brasil só recebe débitos automáticos (contas de casa
  // e parte dos gastos variáveis), então precisa ser reabastecido a partir do Nubank.
  await createTransfer(context, {
    fromAccountId: accounts.nubank.id,
    toAccountId: accounts.bancoDoBrasil.id,
    description: "Transferência entre contas",
    amountCents: randomCentsBetween(700, 1100),
    date: utcDate(year, monthIndex, 2),
  });

  if (chance(0.5)) {
    await createTransfer(context, {
      fromAccountId: accounts.nubank.id,
      toAccountId: accounts.poupancaCaixa.id,
      description: "Transferência para poupança",
      amountCents: randomCentsBetween(200, 900),
      date: utcDate(year, monthIndex, randomDayInMonth(year, monthIndex)),
    });
  }
}

async function seedTransactions(context: SeedContext) {
  const months = lastNMonths(8);
  for (const month of months) {
    await createFixedMonthlyTransactions(context, month);
    await createVariableTransactions(context, month);
    await createMonthlyTransfers(context, month);
  }
  return months;
}

async function allocateSeedCardTransactions(accountId: string) {
  const details = await prisma.creditCardDetails.findUniqueOrThrow({ where: { accountId } });
  const transactions = await prisma.transaction.findMany({
    where: { accountId, invoiceId: null },
    select: { id: true, date: true },
  });

  for (const transaction of transactions) {
    const schedule = invoiceScheduleForPurchase(
      transaction.date,
      details.closingDay,
      details.dueDay,
    );
    const invoice = await prisma.invoice.upsert({
      where: {
        creditCardDetailsId_referenceMonth: {
          creditCardDetailsId: details.id,
          referenceMonth: schedule.referenceMonth,
        },
      },
      create: { creditCardDetailsId: details.id, ...schedule },
      update: {},
      select: { id: true },
    });
    await prisma.transaction.update({
      where: { id: transaction.id },
      data: { invoiceId: invoice.id },
    });
  }
}

/**
 * As três recorrências que todo mundo tem. `lastRunAt` fica no fim do histórico semeado:
 * o gerador não vai relançar o que o seed já criou, e passa a lançar do mês seguinte.
 */
async function seedRecurringRules(context: SeedContext, firstMonth: MonthWindow) {
  const { userId, accounts } = context;
  const inicio = utcDate(firstMonth.year, firstMonth.monthIndex, 1, 0);
  const ultimaRodada = new Date();

  await prisma.recurringRule.createMany({
    data: [
      {
        userId,
        accountId: accounts.nubank.id,
        categoryId: categoryId(context, "Salário CLT"),
        description: "Salário",
        amountCents: toCents(7200),
        type: TransactionType.INCOME,
        frequency: RecurringFrequency.MONTHLY,
        interval: 1,
        dayOfMonth: 5,
        startDate: inicio,
        lastRunAt: ultimaRodada,
      },
      {
        userId,
        accountId: accounts.nubank.id,
        categoryId: categoryId(context, "Aluguel"),
        description: "Aluguel",
        amountCents: toCents(1800),
        type: TransactionType.EXPENSE,
        frequency: RecurringFrequency.MONTHLY,
        interval: 1,
        dayOfMonth: 10,
        startDate: inicio,
        lastRunAt: ultimaRodada,
      },
      {
        userId,
        accountId: accounts.cartaoInter.id,
        categoryId: categoryId(context, "Streaming"),
        description: "Assinatura de streaming",
        amountCents: toCents(55.9),
        type: TransactionType.EXPENSE,
        frequency: RecurringFrequency.MONTHLY,
        interval: 1,
        dayOfMonth: 22,
        startDate: inicio,
        lastRunAt: ultimaRodada,
      },
    ],
  });
}

async function seedBudgets(context: SeedContext, currentMonth: MonthWindow) {
  const month = utcDate(currentMonth.year, currentMonth.monthIndex, 1, 0);

  await Promise.all([
    prisma.budget.create({
      data: {
        userId: context.userId,
        categoryId: categoryId(context, "Alimentação"),
        month,
        limitCents: toCents(1500),
      },
    }),
    prisma.budget.create({
      data: {
        userId: context.userId,
        categoryId: categoryId(context, "Transporte"),
        month,
        limitCents: toCents(700),
      },
    }),
    prisma.budget.create({
      data: {
        userId: context.userId,
        categoryId: categoryId(context, "Lazer"),
        month,
        limitCents: toCents(300),
      },
    }),
  ]);
}

async function seedGoals(context: SeedContext, currentMonth: MonthWindow) {
  const { userId, accounts } = context;
  const yieldCategoryId = categoryId(context, YIELD_CATEGORY_NAME);

  /**
   * Meta agora é caixinha: uma subconta da conta mãe cujo saldo é o progresso. Cada aporte
   * é uma transferência de duas pernas, e o rendimento é uma entrada só, categorizada como
   * sistema — dinheiro novo, sem contrapartida.
   */
  async function seedBucketGoal(goal: {
    name: string;
    targetReais: number;
    monthsAhead: number;
    color: string;
    icon: string;
    ratePercent: number | null;
    deposits: { monthOffset: number; day: number; reais: number }[];
    yields?: { monthOffset: number; reais: number }[];
  }) {
    const bucket = await prisma.account.create({
      data: {
        userId,
        name: goal.name,
        type: AccountType.SAVINGS_BUCKET,
        class: AccountClass.ASSET,
        initialBalanceCents: 0,
        color: goal.color,
        icon: goal.icon,
        parentAccountId: accounts.poupancaCaixa.id,
      },
    });

    await prisma.goal.create({
      data: {
        userId,
        name: goal.name,
        targetCents: toCents(goal.targetReais),
        targetDate: utcDate(currentMonth.year, currentMonth.monthIndex + goal.monthsAhead, 1),
        color: goal.color,
        icon: goal.icon,
        bucketAccountId: bucket.id,
        expectedYearlyRatePercent: goal.ratePercent,
      },
    });

    for (const deposit of goal.deposits) {
      const date = utcDate(
        currentMonth.year,
        currentMonth.monthIndex + deposit.monthOffset,
        deposit.day,
      );
      const transferGroupId = `bucket-${bucket.id}-${deposit.monthOffset}`;

      await prisma.transaction.createMany({
        data: [
          {
            userId,
            accountId: accounts.poupancaCaixa.id,
            date,
            description: `Aporte · ${goal.name}`,
            amountCents: -toCents(deposit.reais),
            type: TransactionType.TRANSFER,
            transferGroupId,
            provider: "manual",
          },
          {
            userId,
            accountId: bucket.id,
            date,
            description: `Aporte · ${goal.name}`,
            amountCents: toCents(deposit.reais),
            type: TransactionType.TRANSFER,
            transferGroupId,
            provider: "manual",
          },
        ],
      });
    }

    for (const entry of goal.yields ?? []) {
      await prisma.transaction.create({
        data: {
          userId,
          accountId: bucket.id,
          categoryId: yieldCategoryId,
          date: utcDate(currentMonth.year, currentMonth.monthIndex + entry.monthOffset, 28),
          description: `Rendimento · ${goal.name}`,
          amountCents: toCents(entry.reais),
          type: TransactionType.INCOME,
          provider: "manual",
        },
      });
    }
  }

  await seedBucketGoal({
    name: "Viagem para o Nordeste",
    targetReais: 8000,
    monthsAhead: 6,
    color: "#0B6E75",
    icon: "plane",
    ratePercent: null,
    deposits: [
      { monthOffset: -2, day: 15, reais: 1200 },
      { monthOffset: -1, day: 15, reais: 1500 },
      { monthOffset: 0, day: 15, reais: 900 },
    ],
  });

  await seedBucketGoal({
    name: "Reserva de emergência",
    targetReais: 20000,
    monthsAhead: 12,
    color: "#2653D9",
    icon: "piggy-bank",
    ratePercent: 10.5,
    deposits: [
      { monthOffset: -1, day: 20, reais: 2000 },
      { monthOffset: 0, day: 20, reais: 1800 },
    ],
    yields: [
      { monthOffset: -1, reais: 12.4 },
      { monthOffset: 0, reais: 27.8 },
    ],
  });
}

/**
 * Categorias criadas pelo sistema. Não são editáveis nem excluíveis pela interface, porque
 * o app depende delas para classificar o que ele mesmo lança.
 */
async function seedSystemCategories(userId: string): Promise<string> {
  const rendimentos = await prisma.category.create({
    data: {
      userId,
      name: YIELD_CATEGORY_NAME,
      kind: CategoryKind.INCOME,
      color: "#0B6E75",
      icon: "chart",
      isSystem: true,
    },
  });

  return rendimentos.id;
}

async function main() {
  await prisma.user.deleteMany();

  const user = await seedUser();
  const accounts = await seedAccounts(user.id);
  const categoryIdByName = await seedCategories(user.id);
  // Rendimento de poupança e de caixinha caem na mesma categoria de sistema: é o que deixa
  // o painel separar receita ativa de dinheiro que rendeu sozinho.
  categoryIdByName.set(YIELD_CATEGORY_NAME, await seedSystemCategories(user.id));
  const tags = await seedTags(user.id);

  const context: SeedContext = { userId: user.id, accounts, categoryIdByName, tags };
  const months = await seedTransactions(context);
  await allocateSeedCardTransactions(accounts.cartaoInter.id);

  const currentMonth = months[months.length - 1];
  await seedBudgets(context, currentMonth);
  await seedGoals(context, currentMonth);
  await seedRecurringRules(context, months[0]);

  const transactionCount = await prisma.transaction.count();
  console.log(`Seed concluído: ${transactionCount} transações em 4 contas, 8 meses de histórico.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
