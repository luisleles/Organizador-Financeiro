import { addMonths, toDateParts, fromZonedParts, type DateParts } from "@/lib/date";
import { monthKey } from "@/server/categories/category.stats";

/**
 * Ritmo e projeção de uma meta. Duas perguntas diferentes que a tela precisa responder:
 * **quanto preciso guardar por mês** para bater o prazo, e **quando eu realmente termino**
 * se continuar no ritmo que venho tendo. A primeira é aritmética do prazo; a segunda é
 * extrapolação do passado recente, e são elas que raramente coincidem.
 */

export const PACE_WINDOW_MONTHS = 3;

/** Teto da projeção: além disso a linha vira ruído e a resposta útil é "não chega". */
const MAX_PROJECTION_MONTHS = 60;

export type Contribution = {
  date: Date;
  amountCents: number;
};

export type GoalPace = {
  savedCents: number;
  targetCents: number;
  remainingCents: number;
  percent: number;
  completed: boolean;
  /** Meses inteiros daqui até o prazo. Zero quando o prazo é este mês ou já passou. */
  monthsToDeadline: number;
  /** `null` quando a meta já foi batida. */
  requiredPerMonthCents: number | null;
  /** Média mensal dos últimos meses da janela. */
  recentPacePerMonthCents: number;
  /** `null` quando o ritmo é zero ou a conclusão passa do horizonte de projeção. */
  projectedDate: Date | null;
  /** Positivo é atraso, negativo é adiantamento. `null` sem projeção. */
  monthsLate: number | null;
  deadlinePassed: boolean;
};

export function monthsBetween(from: DateParts, to: DateParts): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/** Soma dos aportes dentro da janela, dividida pelos meses da janela. */
export function recentPace(
  contributions: readonly Contribution[],
  reference: Date,
  windowMonths = PACE_WINDOW_MONTHS,
): number {
  const today = { ...toDateParts(reference), day: 1 };
  const first = addMonths(today, -(windowMonths - 1));

  const total = contributions
    .filter((contribution) => {
      const parts = toDateParts(contribution.date);
      return monthsBetween(first, parts) >= 0 && monthsBetween(parts, today) >= 0;
    })
    .reduce((sum, contribution) => sum + contribution.amountCents, 0);

  return Math.round(Math.max(total, 0) / windowMonths);
}

/**
 * Meses até o alvo considerando aporte mensal **e** juros compostos sobre o que já está
 * guardado. Sem taxa, cai na divisão simples. Devolve `null` quando não chega dentro do
 * horizonte — inclusive quando o aporte é zero e só o juro não dá conta.
 */
export function monthsToReach(
  currentCents: number,
  targetCents: number,
  monthlyDepositCents: number,
  yearlyRatePercent: number | null,
): number | null {
  if (currentCents >= targetCents) return 0;

  const monthlyRate =
    yearlyRatePercent && yearlyRatePercent > 0 ? (1 + yearlyRatePercent / 100) ** (1 / 12) - 1 : 0;

  if (monthlyDepositCents <= 0 && monthlyRate <= 0) return null;

  let balance = currentCents;
  for (let month = 1; month <= MAX_PROJECTION_MONTHS; month += 1) {
    balance = balance * (1 + monthlyRate) + monthlyDepositCents;
    if (balance >= targetCents) return month;
  }

  return null;
}

export function buildGoalPace(
  savedCents: number,
  targetCents: number,
  targetDate: Date,
  contributions: readonly Contribution[],
  reference: Date = new Date(),
  yearlyRatePercent: number | null = null,
): GoalPace {
  const remainingCents = Math.max(targetCents - savedCents, 0);
  const completed = targetCents > 0 && savedCents >= targetCents;

  const today = { ...toDateParts(reference), day: 1 };
  const deadline = { ...toDateParts(targetDate), day: 1 };
  const monthsToDeadline = Math.max(monthsBetween(today, deadline), 0);
  const deadlinePassed = monthsBetween(today, deadline) < 0;

  const recentPacePerMonthCents = recentPace(contributions, reference);
  const monthsToFinish = completed
    ? 0
    : monthsToReach(savedCents, targetCents, recentPacePerMonthCents, yearlyRatePercent);

  const projectedDate =
    completed || monthsToFinish === null ? null : fromZonedParts(addMonths(today, monthsToFinish));

  return {
    savedCents,
    targetCents,
    remainingCents,
    percent: targetCents <= 0 ? 0 : (savedCents / targetCents) * 100,
    completed,
    monthsToDeadline,
    // Prazo neste mês ou vencido: o que falta precisa sair de uma vez.
    requiredPerMonthCents: completed
      ? null
      : Math.ceil(remainingCents / Math.max(monthsToDeadline, 1)),
    recentPacePerMonthCents,
    projectedDate,
    monthsLate:
      projectedDate === null
        ? null
        : monthsBetween(deadline, { ...toDateParts(projectedDate), day: 1 }),
    deadlinePassed,
  };
}

export type GoalSeriesPoint = {
  month: string;
  /** Acumulado real. `null` nos meses que só existem na projeção. */
  realCents: number | null;
  /** Acumulado projetado. `null` antes do mês atual. */
  projectedCents: number | null;
};

/**
 * Uma linha sólida do acumulado real e uma tracejada da projeção, compartilhando o mês
 * atual para que as duas se encostem em vez de aparecerem cortadas.
 */
export function buildGoalSeries(
  monthlySaved: readonly { month: string; savedCents: number }[],
  pace: GoalPace,
  reference: Date = new Date(),
  /** Mês do prazo, para o eixo alcançá-lo mesmo quando a projeção termina antes. */
  deadlineMonth?: string,
  yearlyRatePercent: number | null = null,
): GoalSeriesPoint[] {
  const currentMonth = monthKey(toDateParts(reference));
  const points: GoalSeriesPoint[] = monthlySaved.map((entry) => ({
    month: entry.month,
    realCents: entry.savedCents,
    projectedCents: entry.month === currentMonth ? entry.savedCents : null,
  }));

  const today = { ...toDateParts(reference), day: 1 };

  const monthsToFinish = pace.completed
    ? 0
    : monthsToReach(
        pace.savedCents,
        pace.targetCents,
        pace.recentPacePerMonthCents,
        yearlyRatePercent,
      );

  if (monthsToFinish !== null) {
    const monthlyRate =
      yearlyRatePercent && yearlyRatePercent > 0
        ? (1 + yearlyRatePercent / 100) ** (1 / 12) - 1
        : 0;
    let running = pace.savedCents;

    for (let index = 1; index <= monthsToFinish; index += 1) {
      running = Math.min(
        Math.round(running * (1 + monthlyRate)) + pace.recentPacePerMonthCents,
        pace.targetCents,
      );
      points.push({
        month: monthKey(addMonths(today, index)),
        realCents: null,
        projectedCents: running,
      });
    }
  }

  return padToDeadline(points, today, deadlineMonth);
}

/**
 * Meses vazios até o prazo. Sem eles, uma meta que termina antes do prazo não teria onde
 * desenhar a linha do prazo — e ver a folga é metade da informação.
 */
function padToDeadline(
  points: GoalSeriesPoint[],
  today: DateParts,
  deadlineMonth: string | undefined,
): GoalSeriesPoint[] {
  const last = points.at(-1)?.month;
  if (!deadlineMonth || !last || deadlineMonth <= last) return points;

  const padded = [...points];
  for (let index = 1; index <= MAX_PROJECTION_MONTHS; index += 1) {
    const month = monthKey(addMonths(today, index));
    if (month <= last) continue;

    padded.push({ month, realCents: null, projectedCents: null });
    if (month >= deadlineMonth) break;
  }

  return padded;
}

/** Acumulado mês a mês dos aportes, do mais antigo ao mês atual. */
export function buildMonthlySaved(
  contributions: readonly Contribution[],
  reference: Date = new Date(),
): { month: string; savedCents: number }[] {
  if (contributions.length === 0) {
    return [{ month: monthKey(toDateParts(reference)), savedCents: 0 }];
  }

  const byMonth = new Map<string, number>();
  for (const contribution of contributions) {
    const key = monthKey(toDateParts(contribution.date));
    byMonth.set(key, (byMonth.get(key) ?? 0) + contribution.amountCents);
  }

  const sorted = [...contributions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = { ...toDateParts(sorted[0].date), day: 1 };
  const today = { ...toDateParts(reference), day: 1 };
  const span = Math.max(monthsBetween(first, today), 0);

  let running = 0;
  return Array.from({ length: span + 1 }, (_, index) => {
    const month = monthKey(addMonths(first, index));
    running += byMonth.get(month) ?? 0;
    return { month, savedCents: running };
  });
}
