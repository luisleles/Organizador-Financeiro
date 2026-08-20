import { addMonths, toDateParts, type DateParts } from "@/lib/date";
import { monthKey } from "@/server/categories/category.stats";

/**
 * Agregações puras dos gráficos. Regra que atravessa o módulo inteiro: **transferência
 * nunca entra em receita nem em despesa** — mover dinheiro entre contas próprias não é
 * ganhar nem gastar, e contá-la infla os dois lados de todo relatório. Quem filtra é a
 * consulta; estas funções assumem que o `TRANSFER` já ficou de fora.
 */

export type SignedEntry = {
  date: Date;
  amountCents: number;
};

export type MonthlyCashFlow = {
  month: string;
  incomeCents: number;
  /** Positivo: é volume gasto, não saldo. */
  expenseCents: number;
  netCents: number;
};

export function monthsEndingAt(monthCount: number, reference: Date): string[] {
  const referenceParts: DateParts = { ...toDateParts(reference), day: 1 };

  return Array.from({ length: monthCount }, (_, index) =>
    monthKey(addMonths(referenceParts, index - (monthCount - 1))),
  );
}

export function buildMonthlyCashFlow(
  entries: readonly SignedEntry[],
  monthCount: number,
  reference: Date = new Date(),
): MonthlyCashFlow[] {
  const months = monthsEndingAt(monthCount, reference);
  const byMonth = new Map(
    months.map((month) => [month, { month, incomeCents: 0, expenseCents: 0, netCents: 0 }]),
  );

  for (const entry of entries) {
    const bucket = byMonth.get(monthKey(toDateParts(entry.date)));
    if (!bucket) continue;

    if (entry.amountCents >= 0) bucket.incomeCents += entry.amountCents;
    else bucket.expenseCents += -entry.amountCents;
    bucket.netCents += entry.amountCents;
  }

  return months.map((month) => byMonth.get(month)!);
}

export type CategoryTotal = {
  categoryId: string | null;
  name: string;
  totalCents: number;
};

/** Do maior para o menor: a lista é para comparar magnitude, então a ordem é o gráfico. */
export function rankCategoryTotals(
  entries: readonly (SignedEntry & { categoryId: string | null; categoryName: string | null })[],
): CategoryTotal[] {
  const totals = new Map<string, CategoryTotal>();

  for (const entry of entries) {
    const key = entry.categoryId ?? "__sem_categoria__";
    const current = totals.get(key) ?? {
      categoryId: entry.categoryId,
      name: entry.categoryName ?? "Sem categoria",
      totalCents: 0,
    };

    current.totalCents += Math.abs(entry.amountCents);
    totals.set(key, current);
  }

  return [...totals.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/**
 * Acima de `limit` categorias o gráfico vira ruído: as menores viram uma linha "Outras",
 * que continua somando o mesmo total.
 */
export function collapseTail(totals: readonly CategoryTotal[], limit: number): CategoryTotal[] {
  if (totals.length <= limit) return [...totals];

  const head = totals.slice(0, limit - 1);
  const tail = totals.slice(limit - 1);

  return [
    ...head,
    {
      categoryId: null,
      name: `Outras ${tail.length}`,
      totalCents: tail.reduce((total, item) => total + item.totalCents, 0),
    },
  ];
}

export type PivotRow = {
  categoryId: string | null;
  name: string;
  /** Um total por mês, na mesma ordem de `months`. */
  monthlyCents: number[];
  totalCents: number;
};

export type CategoryPivot = {
  months: string[];
  rows: PivotRow[];
  /** Maior célula da tabela, base da escala do heatmap. */
  peakCents: number;
};

export function buildCategoryPivot(
  entries: readonly (SignedEntry & { categoryId: string | null; categoryName: string | null })[],
  monthCount: number,
  reference: Date = new Date(),
): CategoryPivot {
  const months = monthsEndingAt(monthCount, reference);
  const indexByMonth = new Map(months.map((month, index) => [month, index]));
  const rows = new Map<string, PivotRow>();

  for (const entry of entries) {
    const monthIndex = indexByMonth.get(monthKey(toDateParts(entry.date)));
    if (monthIndex === undefined) continue;

    const key = entry.categoryId ?? "__sem_categoria__";
    const row = rows.get(key) ?? {
      categoryId: entry.categoryId,
      name: entry.categoryName ?? "Sem categoria",
      monthlyCents: Array(months.length).fill(0),
      totalCents: 0,
    };

    const value = Math.abs(entry.amountCents);
    row.monthlyCents[monthIndex] += value;
    row.totalCents += value;
    rows.set(key, row);
  }

  const ordered = [...rows.values()].sort((a, b) => b.totalCents - a.totalCents);
  const peakCents = ordered.reduce((peak, row) => Math.max(peak, ...row.monthlyCents), 0);

  return { months, rows: ordered, peakCents };
}

/** Passo da rampa sequencial, de 0 (nada) a 5 (o maior valor da tabela). */
export function heatStep(valueCents: number, peakCents: number): number {
  if (valueCents <= 0 || peakCents <= 0) return 0;
  return Math.max(1, Math.ceil((valueCents / peakCents) * 5));
}

/**
 * Quanto da receita sobrou. `null` quando não houve receita: dividir por zero daria um
 * número que parece informação e não é.
 */
export function savingsRate(incomeCents: number, expenseCents: number): number | null {
  if (incomeCents <= 0) return null;
  return Math.round(((incomeCents - expenseCents) / incomeCents) * 1000) / 10;
}

export type BalancePoint = {
  month: string;
  balanceCents: number;
};

/**
 * Saldo total ao fim de cada mês. `openingCents` é o saldo antes do primeiro mês da série.
 * Transferência não distorce nada aqui, porque as duas pernas se anulam no mesmo mês.
 */
export function buildBalanceEvolution(
  openingCents: number,
  monthlyDeltaCents: readonly { month: string; deltaCents: number }[],
): BalancePoint[] {
  let running = openingCents;

  return monthlyDeltaCents.map((entry) => {
    running += entry.deltaCents;
    return { month: entry.month, balanceCents: running };
  });
}

export type Variation = {
  currentCents: number;
  previousCents: number;
  deltaCents: number;
  percent: number | null;
};

export function compareToPrevious(currentCents: number, previousCents: number): Variation {
  return {
    currentCents,
    previousCents,
    deltaCents: currentCents - previousCents,
    percent:
      previousCents === 0
        ? null
        : Math.round(((currentCents - previousCents) / previousCents) * 1000) / 10,
  };
}
