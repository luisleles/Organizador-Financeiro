import {
  addMonths,
  clampToMonth,
  daysBetween,
  fromZonedParts,
  isoDateKey,
  toDateParts,
  type DateParts,
} from "@/lib/date";

/**
 * Cartão de crédito não tem "saldo": tem fatura e limite. Este módulo é puro para que as
 * duas contas que mais confundem — quanto se deve e quanto ainda dá para gastar — possam
 * ser testadas sem banco.
 */

/** Acima disso a barra de uso vira alerta: o limite está perto do fim. */
export const LIMIT_ALERT_PERCENT = 80;

export type CreditCardPosition = {
  /** Dívida da fatura, sempre `<= 0`, no mesmo sinal do extrato. */
  currentDebtCents: number;
  /** Sobra de quem pagou a mais que a fatura. Sempre `>= 0`. */
  creditBalanceCents: number;
  availableLimitCents: number;
  limitUsagePercent: number;
};

export type CreditCardCycle = {
  closingDate: Date;
  dueDate: Date;
  daysUntilClosing: number;
};

export type InvoiceSchedule = {
  referenceMonth: Date;
  closingDate: Date;
  dueDate: Date;
};

export function creditCardPosition(
  balanceCents: number,
  creditLimitCents: number,
): CreditCardPosition {
  const currentDebtCents = Math.min(balanceCents, 0);
  const usedCents = Math.abs(currentDebtCents);

  return {
    currentDebtCents,
    creditBalanceCents: Math.max(balanceCents, 0),
    availableLimitCents: creditLimitCents - usedCents,
    limitUsagePercent:
      creditLimitCents > 0 ? Math.round((usedCents / creditLimitCents) * 10000) / 100 : 0,
  };
}

export function isLimitAlert(limitUsagePercent: number): boolean {
  return limitUsagePercent > LIMIT_ALERT_PERCENT;
}

/**
 * Próximo fechamento e o vencimento correspondente, no calendário de São Paulo. Se o dia
 * de vencimento é menor ou igual ao de fechamento, a fatura vence no mês seguinte ao
 * fechamento — é o comportamento normal de cartão.
 */
export function creditCardCycle(
  closingDay: number,
  dueDay: number,
  now: Date = new Date(),
): CreditCardCycle {
  const today = toDateParts(now);
  const { closing, due } = cycleFor(today, closingDay, dueDay);

  return {
    closingDate: fromZonedParts(closing),
    dueDate: fromZonedParts(due),
    daysUntilClosing: daysBetween(today, closing),
  };
}

/** Datas persistidas de uma fatura, a partir do mês de referência no calendário local. */
export function invoiceScheduleForReference(
  referenceMonth: DateParts,
  closingDay: number,
  dueDay: number,
): InvoiceSchedule {
  const month = { ...referenceMonth, day: 1 };
  const dueMonth = dueDay > closingDay ? month : addMonths(month, 1);

  return {
    referenceMonth: fromZonedParts(month),
    closingDate: fromZonedParts(clampToMonth(month, closingDay)),
    dueDate: fromZonedParts(clampToMonth(dueMonth, dueDay)),
  };
}

/** Primeira fatura cujo fechamento inclui a data da compra. */
export function invoiceScheduleForPurchase(
  purchaseDate: Date,
  closingDay: number,
  dueDay: number,
): InvoiceSchedule {
  const purchase = toDateParts(purchaseDate);
  const month = { ...purchase, day: 1 };
  const closing = clampToMonth(month, closingDay);
  const referenceMonth = purchase.day <= closing.day ? month : addMonths(month, 1);
  return invoiceScheduleForReference(referenceMonth, closingDay, dueDay);
}

export function shiftInvoiceSchedule(
  schedule: InvoiceSchedule,
  months: number,
  closingDay: number,
  dueDay: number,
): InvoiceSchedule {
  return invoiceScheduleForReference(
    addMonths(toDateParts(schedule.referenceMonth), months),
    closingDay,
    dueDay,
  );
}

/** Divide um total inteiro sem perder centavos; o resto fica nas primeiras parcelas. */
export function splitInstallmentCents(totalCents: number, installments: number): number[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new RangeError("O total parcelado deve ser um inteiro positivo em centavos.");
  }
  if (!Number.isInteger(installments) || installments < 1) {
    throw new RangeError("A quantidade de parcelas deve ser um inteiro positivo.");
  }

  const base = Math.floor(totalCents / installments);
  const remainder = totalCents % installments;
  return Array.from({ length: installments }, (_, index) => base + (index < remainder ? 1 : 0));
}

/** Mantém o dia da compra nas parcelas seguintes, encaixando-o em meses curtos. */
export function shiftPurchaseDate(purchaseDate: Date, months: number): Date {
  const parts = toDateParts(purchaseDate);
  const target = addMonths({ ...parts, day: 1 }, months);
  return fromZonedParts(clampToMonth(target, parts.day));
}

/**
 * Em que fatura um lançamento cai: a primeira que fecha na data dele ou depois. Compra do
 * dia 25 com fechamento no dia 20 entra na fatura do mês seguinte, que é o que o extrato
 * de cartão precisa mostrar.
 */
function cycleFor(
  date: DateParts,
  closingDay: number,
  dueDay: number,
): { closing: DateParts; due: DateParts } {
  const firstOfMonth = { ...date, day: 1 };
  const closingThisMonth = clampToMonth(firstOfMonth, closingDay);
  const closingMonth = date.day <= closingThisMonth.day ? firstOfMonth : addMonths(firstOfMonth, 1);
  const dueMonth = dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1);

  return {
    closing: clampToMonth(closingMonth, closingDay),
    due: clampToMonth(dueMonth, dueDay),
  };
}

export type InvoiceStatus = "fechada" | "aberta" | "futura";

export type InvoiceGroup<TEntry> = {
  /** Chave estável no formato `AAAA-MM-DD` da data de fechamento. */
  key: string;
  closingDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  /** Soma dos lançamentos da fatura, no mesmo sinal do extrato. */
  totalCents: number;
  entries: TEntry[];
};

type DatedEntry = {
  date: Date;
  amountCents: number;
};

/**
 * Agrupa o extrato pela fatura em que cada lançamento cai, da mais recente para a mais
 * antiga. Preserva a ordem em que as entradas chegaram dentro de cada grupo.
 */
export function groupByInvoice<TEntry extends DatedEntry>(
  entries: readonly TEntry[],
  closingDay: number,
  dueDay: number,
  now: Date = new Date(),
): InvoiceGroup<TEntry>[] {
  const openKey = isoDateKey(cycleFor(toDateParts(now), closingDay, dueDay).closing);
  const groups = new Map<string, InvoiceGroup<TEntry>>();

  for (const entry of entries) {
    const { closing, due } = cycleFor(toDateParts(entry.date), closingDay, dueDay);
    const key = isoDateKey(closing);

    const group = groups.get(key) ?? {
      key,
      closingDate: fromZonedParts(closing),
      dueDate: fromZonedParts(due),
      status: compareKeys(key, openKey),
      totalCents: 0,
      entries: [],
    };

    group.totalCents += entry.amountCents;
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/** Início do recorte de histórico: o fechamento de `cyclesBack` faturas atrás. */
export function invoiceHistoryStart(
  closingDay: number,
  dueDay: number,
  cyclesBack: number,
  now: Date = new Date(),
): Date {
  const current = cycleFor(toDateParts(now), closingDay, dueDay).closing;
  return fromZonedParts(clampToMonth(addMonths({ ...current, day: 1 }, -cyclesBack), closingDay));
}

function compareKeys(key: string, openKey: string): InvoiceStatus {
  if (key === openKey) return "aberta";
  return key < openKey ? "fechada" : "futura";
}
