import { toDateParts, type DateParts } from "@/lib/date";

/**
 * Regras de acompanhamento de orçamento. O ponto central é o **ritmo**: gastar 60% do
 * limite não diz nada sozinho — no dia 10 de 30 é problema, no dia 25 é folga. Todo o
 * módulo é puro para que essa comparação possa ser testada dia a dia sem banco.
 */

export type BudgetStatus = "dentro" | "atencao" | "estourado";

export function daysInMonth(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

/**
 * Quanto do mês já passou, de 0 a 1. O dia corrente conta inteiro: no dia 1 de 30 já se
 * passou 1/30 do mês, e não zero.
 */
export function monthProgress(reference: Date, month: DateParts): number {
  const today = toDateParts(reference);
  const total = daysInMonth(month);

  if (today.year > month.year || (today.year === month.year && today.month > month.month)) {
    return 1;
  }
  if (today.year < month.year || (today.year === month.year && today.month < month.month)) {
    return 0;
  }

  return Math.min(today.day / total, 1);
}

/** Quanto já poderia ter sido gasto sem sair do ritmo. */
export function pacedLimitCents(limitCents: number, progress: number): number {
  return Math.round(limitCents * progress);
}

export function budgetStatus(
  spentCents: number,
  limitCents: number,
  pacedCents: number,
): BudgetStatus {
  if (spentCents > limitCents) return "estourado";
  if (spentCents > pacedCents) return "atencao";
  return "dentro";
}

export type BudgetProgress = {
  spentCents: number;
  limitCents: number;
  remainingCents: number;
  pacedCents: number;
  /** Percentual do limite já usado. Pode passar de 100. */
  usedPercent: number;
  /** Onde o marcador de ritmo fica na barra, de 0 a 100. */
  pacePercent: number;
  status: BudgetStatus;
  /** Quanto o gasto está além do ritmo esperado. Zero quando está em dia. */
  aheadOfPaceCents: number;
};

export function buildBudgetProgress(
  spentCents: number,
  limitCents: number,
  progress: number,
): BudgetProgress {
  const pacedCents = pacedLimitCents(limitCents, progress);

  return {
    spentCents,
    limitCents,
    remainingCents: limitCents - spentCents,
    pacedCents,
    usedPercent: limitCents <= 0 ? (spentCents > 0 ? 100 : 0) : (spentCents / limitCents) * 100,
    pacePercent: progress * 100,
    status: budgetStatus(spentCents, limitCents, pacedCents),
    aheadOfPaceCents: Math.max(spentCents - pacedCents, 0),
  };
}

export type Adherence = {
  month: string;
  limitCents: number;
  spentCents: number;
  /** `null` quando não havia orçamento definido naquele mês. */
  usedPercent: number | null;
  status: BudgetStatus | null;
};

/**
 * Aderência de um mês fechado: aqui o ritmo esperado é o mês inteiro, então "atenção" não
 * existe — ou coube no limite, ou estourou.
 */
export function monthAdherence(
  month: string,
  limitCents: number | null,
  spentCents: number,
): Adherence {
  if (limitCents === null) {
    return { month, limitCents: 0, spentCents, usedPercent: null, status: null };
  }

  return {
    month,
    limitCents,
    spentCents,
    usedPercent: limitCents <= 0 ? (spentCents > 0 ? 100 : 0) : (spentCents / limitCents) * 100,
    status: spentCents > limitCents ? "estourado" : "dentro",
  };
}
