import { Prisma } from "@prisma/client";
import {
  addDays,
  fromISODate,
  fromZonedParts,
  isoDateKey,
  toDateParts,
  type DateParts,
} from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { invoiceScheduleForPurchase } from "@/server/accounts/account.credit-card";
import { isBucket, splitParentBalance } from "@/server/accounts/account.buckets";
import {
  AccountOperationError,
  OPERATION_RULE_MESSAGES,
  validateOperation,
} from "@/server/accounts/account.operations";
import { requireUserId } from "@/server/current-user";
import { createTransaction } from "@/server/transactions/transaction.service";
import {
  buildBalanceProjection,
  firstNegativeDay,
  lowestDay,
  type ProjectionEvent,
} from "./recurrence.projection";
import type { OccurrenceRef, RecurringRuleInput } from "./recurrence.schema";
import {
  nextOccurrence,
  occurrenceKey,
  occurrencesBetween,
  type ScheduleRule,
} from "./recurrence.schedule";
import type {
  BalanceProjection,
  MaterializationResult,
  RecurringRuleRow,
  UpcomingOccurrence,
} from "./recurrence.types";

/** Marca deixada nos lançamentos gerados: é por ela que a segunda rodada reconhece o que já fez. */
export const RECURRENCE_PROVIDER = "recorrencia";

export const UPCOMING_WINDOW_DAYS = 30;
export const PROJECTION_WINDOW_DAYS = 90;

export type RecurrenceErrorCode =
  "NOT_FOUND" | "BUCKET_ACCOUNT" | "ALREADY_MATERIALIZED" | "INVALID_OPERATION";

export class RecurrenceServiceError extends Error {
  constructor(
    readonly code: RecurrenceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RecurrenceServiceError";
  }
}

const ruleWithNames = {
  include: {
    account: { select: { name: true, class: true, type: true } },
    category: { select: { name: true } },
  },
} satisfies Prisma.RecurringRuleDefaultArgs;

type RuleWithNames = Prisma.RecurringRuleGetPayload<typeof ruleWithNames>;

export async function listRecurringRules(
  reference: Date = new Date(),
): Promise<RecurringRuleRow[]> {
  const userId = await requireUserId();
  const rules = await prisma.recurringRule.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { description: "asc" }],
    ...ruleWithNames,
  });

  return rules.map((rule) => toRow(rule, reference));
}

export async function createRecurringRule(input: RecurringRuleInput): Promise<string> {
  const userId = await requireUserId();
  await assertUsableAccount(userId, input.accountId, input.type, input.amountCents);

  const created = await prisma.recurringRule.create({
    data: { ...ruleData(input), userId },
    select: { id: true },
  });

  return created.id;
}

export async function updateRecurringRule(
  ruleId: string,
  input: RecurringRuleInput,
): Promise<void> {
  const userId = await requireUserId();
  await assertUsableAccount(userId, input.accountId, input.type, input.amountCents);

  const { count } = await prisma.recurringRule.updateMany({
    where: { id: ruleId, userId },
    data: ruleData(input),
  });

  if (count === 0) throw notFound();
}

export async function setRecurringRuleActive(ruleId: string, active: boolean): Promise<void> {
  const userId = await requireUserId();
  const { count } = await prisma.recurringRule.updateMany({
    where: { id: ruleId, userId },
    data: { active },
  });

  if (count === 0) throw notFound();
}

/**
 * Apagar a regra não apaga o que ela já lançou: aqueles lançamentos são history de verdade,
 * dinheiro que entrou e saiu. Some só a regra e os ajustes de ocorrências futuras.
 */
export async function deleteRecurringRule(ruleId: string): Promise<void> {
  const userId = await requireUserId();
  const { count } = await prisma.recurringRule.deleteMany({ where: { id: ruleId, userId } });
  if (count === 0) throw notFound();
}

/**
 * Cria os lançamentos de toda ocorrência vencida até hoje. Roda toda vez que o app abre, e
 * por isso precisa ser idempotente em dois níveis: `lastRunAt` evita reprocessar o passado
 * inteiro, e a chave da ocorrência em `[provider, externalId]` é uma restrição do banco —
 * mesmo com relógio errado, dois abrires simultâneos ou um `lastRunAt` desatualizado, a
 * segunda tentativa de gravar o mesmo dia esbarra no índice único.
 */
export async function materializeDueRecurrences(
  reference: Date = new Date(),
): Promise<MaterializationResult> {
  const userId = await requireUserId();
  const today = toDateParts(reference);
  const untilInstant = fromZonedParts(today, true);

  const rules = await prisma.recurringRule.findMany({
    where: { userId, active: true, startDate: { lte: untilInstant } },
    include: { overrides: true },
  });

  let createdCount = 0;

  for (const rule of rules) {
    const from = rule.lastRunAt
      ? fromZonedParts(addDays(toDateParts(rule.lastRunAt), 1))
      : rule.startDate;
    const dates = occurrencesBetween(toSchedule(rule), from, untilInstant);

    if (dates.length > 0) {
      const overrides = overridesByKey(rule.overrides);
      const keys = dates.map((date) => occurrenceKey(rule.id, date));
      const existing = new Set(
        (
          await prisma.transaction.findMany({
            where: { userId, provider: RECURRENCE_PROVIDER, externalId: { in: keys } },
            select: { externalId: true },
          })
        ).map((row) => row.externalId),
      );

      for (const date of dates) {
        const key = occurrenceKey(rule.id, date);
        if (existing.has(key)) continue;

        const override = overrides.get(isoDateKey(toDateParts(date)));
        if (override?.skipped) continue;

        const criado = await createOccurrenceTransaction(rule, date, override?.amountCents ?? null);
        if (criado) createdCount += 1;
      }
    }

    await prisma.recurringRule.update({
      where: { id: rule.id },
      data: { lastRunAt: fromZonedParts(today) },
    });
  }

  return { createdCount };
}

export async function listUpcomingOccurrences(
  days: number = UPCOMING_WINDOW_DAYS,
  reference: Date = new Date(),
): Promise<UpcomingOccurrence[]> {
  const userId = await requireUserId();
  const today = toDateParts(reference);
  const from = fromZonedParts(addDays(today, 1));
  const to = fromZonedParts(addDays(today, days), true);

  const rules = await prisma.recurringRule.findMany({
    where: { userId, active: true },
    include: { ...ruleWithNames.include, overrides: true },
  });

  const upcoming = rules.flatMap((rule) => {
    const overrides = overridesByKey(rule.overrides);
    return occurrencesBetween(toSchedule(rule), from, to).map((date) => {
      const dateKey = isoDateKey(toDateParts(date));
      const override = overrides.get(dateKey);

      return {
        ruleId: rule.id,
        date,
        dateKey,
        description: rule.description,
        amountCents: override?.amountCents ?? rule.amountCents,
        type: rule.type,
        accountName: rule.account.name,
        isCreditCard: rule.account.class === "LIABILITY",
        categoryName: rule.category?.name ?? null,
        skipped: override?.skipped ?? false,
        edited: override?.amountCents != null && override.amountCents !== rule.amountCents,
      } satisfies UpcomingOccurrence;
    });
  });

  return upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Pular vale só para aquele dia: a regra continua valendo para as próximas ocorrências. */
export async function skipOccurrence(ref: OccurrenceRef): Promise<void> {
  await upsertOverride(ref, { skipped: true });
}

export async function restoreOccurrence(ref: OccurrenceRef): Promise<void> {
  await upsertOverride(ref, { skipped: false });
}

export async function setOccurrenceAmount(ref: OccurrenceRef, amountCents: number): Promise<void> {
  await upsertOverride(ref, { amountCents });
}

/** Antecipa uma ocorrência futura: vira lançamento agora, com a mesma chave de sempre. */
export async function confirmOccurrence(ref: OccurrenceRef): Promise<void> {
  const userId = await requireUserId();
  const rule = await prisma.recurringRule.findFirst({
    where: { id: ref.ruleId, userId },
    include: { overrides: true },
  });
  if (!rule) throw notFound();

  const date = fromISODate(ref.date);
  const key = occurrenceKey(rule.id, date);
  const existing = await prisma.transaction.findFirst({
    where: { userId, provider: RECURRENCE_PROVIDER, externalId: key },
    select: { id: true },
  });

  if (existing) {
    throw new RecurrenceServiceError(
      "ALREADY_MATERIALIZED",
      "Esta ocorrência já virou lançamento.",
    );
  }

  const override = overridesByKey(rule.overrides).get(ref.date);
  await createOccurrenceTransaction(rule, date, override?.amountCents ?? null);
}

export async function getBalanceProjection(
  days: number = PROJECTION_WINDOW_DAYS,
  reference: Date = new Date(),
): Promise<BalanceProjection> {
  const userId = await requireUserId();
  const today = toDateParts(reference);
  const from = fromZonedParts(today);
  const to = fromZonedParts(addDays(today, days), true);

  const [openingCents, recurrenceEvents, invoiceEvents] = await Promise.all([
    availableBalanceCents(userId),
    projectedRecurrences(userId, addDays(today, 1), to),
    projectedInvoices(userId, from, to),
  ]);

  const projecao = buildBalanceProjection({
    openingCents,
    from,
    days,
    events: [...recurrenceEvents, ...invoiceEvents],
  });

  return {
    openingCents,
    days: projecao,
    firstNegative: firstNegativeDay(projecao),
    lowest: lowestDay(projecao),
  };
}

/**
 * O saldo que a projeção parte é o dinheiro livre nas contas de ativo — sem o que está
 * guardado em caixinha, que tem dono, e sem descontar fatura, que entra na curva no dia do
 * vencimento. É essa a conta que fica negativa quando o mês aperta.
 */
async function availableBalanceCents(userId: string): Promise<number> {
  const [accounts, movements] = await Promise.all([
    prisma.account.findMany({
      where: { userId, archived: false, class: "ASSET" },
      select: { id: true, type: true, parentAccountId: true, initialBalanceCents: true },
    }),
    prisma.transaction.groupBy({
      by: ["accountId"],
      where: { userId },
      _sum: { amountCents: true },
    }),
  ]);

  const movementById = new Map(movements.map((row) => [row.accountId, row._sum.amountCents ?? 0]));
  const balanceOf = (account: { id: string; initialBalanceCents: number }) =>
    account.initialBalanceCents + (movementById.get(account.id) ?? 0);

  const bucketsByParent = new Map<string, number[]>();
  for (const account of accounts) {
    if (!isBucket(account) || !account.parentAccountId) continue;
    const atual = bucketsByParent.get(account.parentAccountId) ?? [];
    bucketsByParent.set(account.parentAccountId, [...atual, balanceOf(account)]);
  }

  return accounts
    .filter((account) => !isBucket(account))
    .reduce((total, account) => {
      const split = splitParentBalance(balanceOf(account), bucketsByParent.get(account.id) ?? []);
      return total + split.availableCents;
    }, 0);
}

async function projectedRecurrences(
  userId: string,
  fromParts: DateParts,
  to: Date,
): Promise<ProjectionEvent[]> {
  const rules = await prisma.recurringRule.findMany({
    where: { userId, active: true },
    include: {
      overrides: true,
      account: {
        select: {
          name: true,
          class: true,
          creditCardDetails: { select: { closingDay: true, dueDay: true } },
        },
      },
    },
  });

  const from = fromZonedParts(fromParts);

  return rules.flatMap((rule) => {
    const overrides = overridesByKey(rule.overrides);
    const sinal = rule.type === "INCOME" ? 1 : -1;

    return occurrencesBetween(toSchedule(rule), from, to).flatMap((date) => {
      const override = overrides.get(isoDateKey(toDateParts(date)));
      if (override?.skipped) return [];

      const amountCents = sinal * (override?.amountCents ?? rule.amountCents);
      const details = rule.account.creditCardDetails;

      // Assinatura no cartão não tira dinheiro da conta no dia da cobrança: ela engorda uma
      // fatura, e o caixa só sente no vencimento dela.
      const efetiva =
        rule.account.class === "LIABILITY" && details
          ? invoiceScheduleForPurchase(date, details.closingDay, details.dueDay).dueDate
          : date;

      if (efetiva > to) return [];

      return [
        {
          date: efetiva,
          amountCents,
          label: rule.description,
          kind: "recorrencia" as const,
        },
      ];
    });
  });
}

async function projectedInvoices(userId: string, from: Date, to: Date): Promise<ProjectionEvent[]> {
  const invoices = await prisma.invoice.findMany({
    where: {
      dueDate: { gte: from, lte: to },
      creditCardDetails: { account: { userId, archived: false } },
    },
    select: {
      dueDate: true,
      creditCardDetails: { select: { account: { select: { name: true } } } },
      transactions: { select: { amountCents: true } },
    },
  });

  return invoices.flatMap((invoice) => {
    const totalCents = invoice.transactions.reduce((total, row) => total + row.amountCents, 0);
    if (totalCents >= 0) return [];

    return [
      {
        date: invoice.dueDate,
        amountCents: totalCents,
        label: `Fatura ${invoice.creditCardDetails.account.name}`,
        kind: "fatura" as const,
      },
    ];
  });
}

async function createOccurrenceTransaction(
  rule: {
    id: string;
    accountId: string;
    categoryId: string | null;
    description: string;
    amountCents: number;
    type: string;
  },
  date: Date,
  amountOverrideCents: number | null,
): Promise<boolean> {
  try {
    await createTransaction(
      {
        date: isoDateKey(toDateParts(date)),
        description: rule.description,
        amountCents: amountOverrideCents ?? rule.amountCents,
        type: rule.type === "INCOME" ? "INCOME" : "EXPENSE",
        accountId: rule.accountId,
        categoryId: rule.categoryId,
        tagIds: [],
        notes: null,
      },
      { provider: RECURRENCE_PROVIDER, externalId: occurrenceKey(rule.id, date) },
    );
    return true;
  } catch (error) {
    // Corrida entre duas rodadas: quem perdeu encontra a ocorrência já gravada e segue.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return false;
    // Defesa em profundidade: a regra já barra isto na criação da regra. Uma regra antiga
    // que driblou aquela checagem (dado migrado à mão, por exemplo) não trava a rodada
    // inteira — só esta ocorrência fica de fora.
    if (error instanceof AccountOperationError) return false;
    throw error;
  }
}

async function upsertOverride(
  ref: OccurrenceRef,
  data: { skipped?: boolean; amountCents?: number },
): Promise<void> {
  const userId = await requireUserId();
  const rule = await prisma.recurringRule.findFirst({
    where: { id: ref.ruleId, userId },
    select: { id: true },
  });
  if (!rule) throw notFound();

  const date = fromISODate(ref.date);
  await prisma.recurringOverride.upsert({
    where: { ruleId_date: { ruleId: rule.id, date } },
    create: { ruleId: rule.id, date, ...data },
    update: data,
  });
}

function overridesByKey(
  overrides: readonly { date: Date; skipped: boolean; amountCents: number | null }[],
): Map<string, { skipped: boolean; amountCents: number | null }> {
  return new Map(
    overrides.map((override) => [
      isoDateKey(toDateParts(override.date)),
      { skipped: override.skipped, amountCents: override.amountCents },
    ]),
  );
}

function toSchedule(rule: {
  frequency: string;
  interval: number;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
}): ScheduleRule {
  return {
    frequency: rule.frequency as ScheduleRule["frequency"],
    interval: rule.interval,
    dayOfMonth: rule.dayOfMonth,
    startDate: rule.startDate,
    endDate: rule.endDate,
  };
}

function toRow(rule: RuleWithNames, reference: Date): RecurringRuleRow {
  return {
    id: rule.id,
    description: rule.description,
    amountCents: rule.amountCents,
    type: rule.type,
    accountId: rule.accountId,
    accountName: rule.account.name,
    isCreditCard: rule.account.class === "LIABILITY",
    categoryId: rule.categoryId,
    categoryName: rule.category?.name ?? null,
    frequency: rule.frequency,
    interval: rule.interval,
    dayOfMonth: rule.dayOfMonth,
    startDate: rule.startDate,
    endDate: rule.endDate,
    active: rule.active,
    lastRunAt: rule.lastRunAt,
    nextOccurrenceAt: rule.active ? nextOccurrence(toSchedule(rule), reference) : null,
  };
}

function ruleData(input: RecurringRuleInput) {
  return {
    description: input.description,
    amountCents: input.amountCents,
    type: input.type,
    accountId: input.accountId,
    categoryId: input.categoryId,
    frequency: input.frequency,
    interval: input.interval,
    dayOfMonth: input.frequency === "MONTHLY" ? input.dayOfMonth : null,
    startDate: fromISODate(input.startDate),
    endDate: input.endDate ? fromISODate(input.endDate) : null,
  };
}

async function assertUsableAccount(
  userId: string,
  accountId: string,
  type: "INCOME" | "EXPENSE",
  amountCents: number,
): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId },
    select: { id: true, type: true, class: true, parentAccountId: true },
  });
  if (!account) throw notFound();

  if (isBucket(account)) {
    throw new RecurrenceServiceError(
      "BUCKET_ACCOUNT",
      "Caixinha só recebe aporte e rendimento pela meta. Escolha a conta mãe.",
    );
  }

  // Mesma regra de "o que esta conta aceita" que vale para lançamento manual: uma
  // recorrência não pode criar receita num cartão de crédito.
  const violation = validateOperation(account, type, amountCents);
  if (violation) {
    throw new RecurrenceServiceError("INVALID_OPERATION", OPERATION_RULE_MESSAGES[violation]);
  }
}

function notFound(): RecurrenceServiceError {
  return new RecurrenceServiceError("NOT_FOUND", "Recorrência não encontrada.");
}
