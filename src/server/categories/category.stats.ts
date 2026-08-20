import { addMonths, toDateParts, type DateParts } from "@/lib/date";

/**
 * Números da tela de detalhe da categoria: quanto foi gasto mês a mês e como o período
 * atual se compara com o anterior. Puro, porque é aqui que erro de sinal e de fuso passa
 * despercebido em produção.
 */

export type MonthlyTotal = {
  /** Chave `AAAA-MM` no calendário de São Paulo. */
  month: string;
  /** Sempre positivo: é volume gasto (ou recebido), não saldo. */
  totalCents: number;
};

export type PeriodComparison = {
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  /** `null` quando o período anterior foi zero: variação percentual não existiria. */
  deltaPercent: number | null;
};

export function monthKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

/**
 * Uma linha por mês, do mais antigo para o mais recente, incluindo meses sem lançamento —
 * um gráfico com buracos mente sobre a evolução.
 */
export function buildMonthlyTotals(
  entries: readonly { date: Date; amountCents: number }[],
  monthCount: number,
  reference: Date = new Date(),
): MonthlyTotal[] {
  const referenceParts = { ...toDateParts(reference), day: 1 };
  const months = Array.from({ length: monthCount }, (_, index) =>
    monthKey(addMonths(referenceParts, index - (monthCount - 1))),
  );

  const totals = new Map(months.map((month) => [month, 0]));

  for (const entry of entries) {
    const key = monthKey(toDateParts(entry.date));
    const current = totals.get(key);
    if (current === undefined) continue;
    totals.set(key, current + Math.abs(entry.amountCents));
  }

  return months.map((month) => ({ month, totalCents: totals.get(month) ?? 0 }));
}

export function comparePeriods(currentCents: number, previousCents: number): PeriodComparison {
  const deltaCents = currentCents - previousCents;

  return {
    currentCents,
    previousCents,
    deltaCents,
    deltaPercent: previousCents === 0 ? null : Math.round((deltaCents / previousCents) * 1000) / 10,
  };
}

/** Rótulo curto do mês (`ago/26`) para o eixo do gráfico. */
export function formatMonthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const formatter = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });
  const label = formatter.format(new Date(Date.UTC(year, monthNumber - 1, 1))).replace(".", "");

  return `${label}/${String(year).slice(2)}`;
}
