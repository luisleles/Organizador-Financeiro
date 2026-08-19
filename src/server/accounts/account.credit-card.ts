import { addMonths, fromZonedParts, toDateParts, type DateParts } from "@/lib/date";

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

  const closingMonth =
    today.day <= closingDay ? { ...today, day: 1 } : addMonths({ ...today, day: 1 }, 1);
  const closing = clampToMonth(closingMonth, closingDay);

  const dueMonth = dueDay > closingDay ? closingMonth : addMonths(closingMonth, 1);
  const due = clampToMonth(dueMonth, dueDay);

  return {
    closingDate: fromZonedParts(closing),
    dueDate: fromZonedParts(due),
    daysUntilClosing: daysBetween(today, closing),
  };
}

function daysInMonth(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

function clampToMonth(month: DateParts, day: number): DateParts {
  return { ...month, day: Math.min(day, daysInMonth(month)) };
}

/** Diferença em dias de calendário, sem depender de hora nem de fuso. */
function daysBetween(from: DateParts, to: DateParts): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}
