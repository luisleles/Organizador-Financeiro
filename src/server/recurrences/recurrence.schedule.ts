import {
  addDays,
  addMonths,
  clampToMonth,
  fromZonedParts,
  isoDateKey,
  toDateParts,
  type DateParts,
} from "@/lib/date";

/**
 * Quando uma regra acontece. Módulo puro: recebe a regra e uma janela, devolve datas.
 *
 * Toda conta é feita em dia de calendário de São Paulo, nunca somando milissegundos —
 * "todo dia 5" precisa cair no dia 5 mesmo no mês em que o horário de verão muda, e um
 * mês não tem número fixo de dias.
 */

export type RecurringFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type ScheduleRule = {
  frequency: RecurringFrequency;
  /** A cada quantos períodos: 2 em WEEKLY é quinzenal. */
  interval: number;
  /** Só em MONTHLY. Vazio significa repetir o dia da data de início. */
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
};

/** Teto de segurança: uma regra diária de dez anos não trava o servidor por engano. */
const MAX_OCCURRENCES = 4000;

export function occurrenceKey(ruleId: string, date: Date): string {
  return `${ruleId}:${isoDateKey(toDateParts(date))}`;
}

/**
 * Datas da regra dentro de `[from, to]`, em ordem crescente. A contagem parte sempre da
 * data de início, e não do começo da janela: é isso que faz "a cada 2 semanas" manter a
 * mesma paridade em qualquer trecho que se olhe.
 */
export function occurrencesBetween(rule: ScheduleRule, from: Date, to: Date): Date[] {
  const start = toDateParts(rule.startDate);
  const limit = toDateParts(to);
  const first = toDateParts(from);
  const end = rule.endDate ? toDateParts(rule.endDate) : null;
  const step = Math.max(1, Math.trunc(rule.interval));

  const datas: Date[] = [];
  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const parts = occurrenceAt(rule, start, step, index);
    if (isAfter(parts, limit)) break;
    if (end && isAfter(parts, end)) break;
    if (!isAfter(first, parts)) datas.push(fromZonedParts(parts));
  }

  return datas;
}

/** Primeira ocorrência estritamente depois de `after`, ou nula se a regra já terminou. */
export function nextOccurrence(rule: ScheduleRule, after: Date): Date | null {
  const start = toDateParts(rule.startDate);
  const reference = toDateParts(after);
  const end = rule.endDate ? toDateParts(rule.endDate) : null;
  const step = Math.max(1, Math.trunc(rule.interval));

  for (let index = 0; index < MAX_OCCURRENCES; index += 1) {
    const parts = occurrenceAt(rule, start, step, index);
    if (end && isAfter(parts, end)) return null;
    if (isAfter(parts, reference)) return fromZonedParts(parts);
  }

  return null;
}

function occurrenceAt(
  rule: ScheduleRule,
  start: DateParts,
  step: number,
  index: number,
): DateParts {
  switch (rule.frequency) {
    case "DAILY":
      return addDays(start, step * index);
    case "WEEKLY":
      return addDays(start, step * index * 7);
    case "MONTHLY":
      return clampToMonth(addMonths(start, step * index), rule.dayOfMonth ?? start.day);
    case "YEARLY":
      return clampToMonth(addMonths(start, step * index * 12), start.day);
  }
}

function isAfter(parts: DateParts, reference: DateParts): boolean {
  if (parts.year !== reference.year) return parts.year > reference.year;
  if (parts.month !== reference.month) return parts.month > reference.month;
  return parts.day > reference.day;
}
