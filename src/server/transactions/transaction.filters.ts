import type { TransactionType } from "@prisma/client";
import { toDateParts } from "@/lib/date";
import { formatCentsForInput, parseBRLInput } from "@/lib/money";

/**
 * Todo filtro vive na URL: o estado da listagem é o endereço, e um link colado no chat
 * abre exatamente a mesma tela. A faixa de valor viaja em reais ("1.234,56") e não em
 * centavos, porque assim o formulário de filtro funciona como um `<form method="get">`
 * comum, sem JavaScript nenhum para traduzir o campo antes de enviar.
 */

export const PAGE_SIZE = 50;

export const TRANSACTION_SORTS = ["data", "valor"] as const;
export type TransactionSort = (typeof TRANSACTION_SORTS)[number];

export const SORT_DIRECTIONS = ["asc", "desc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const TRANSACTION_TYPE_VALUES = ["INCOME", "EXPENSE", "TRANSFER", "REFUND"] as const;

export const FILTER_PARAMS = {
  account: "conta",
  category: "categoria",
  tag: "tag",
  type: "tipo",
  min: "min",
  max: "max",
  search: "q",
  sort: "ordem",
  direction: "dir",
  page: "pagina",
} as const;

export type TransactionFilters = {
  accountIds: string[];
  categoryIds: string[];
  tagIds: string[];
  type: TransactionType | null;
  minCents: number | null;
  maxCents: number | null;
  search: string;
  sort: TransactionSort;
  direction: SortDirection;
  page: number;
};

export const DEFAULT_FILTERS: TransactionFilters = {
  accountIds: [],
  categoryIds: [],
  tagIds: [],
  type: null,
  minCents: null,
  maxCents: null,
  search: "",
  sort: "data",
  direction: "desc",
  page: 1,
};

type ReadableParams = {
  get: (name: string) => string | null;
  getAll: (name: string) => string[];
};

export function parseFilters(params: ReadableParams): TransactionFilters {
  const type = params.get(FILTER_PARAMS.type);
  const sort = params.get(FILTER_PARAMS.sort);
  const direction = params.get(FILTER_PARAMS.direction);

  const minCents = parseCents(params.get(FILTER_PARAMS.min));
  const maxCents = parseCents(params.get(FILTER_PARAMS.max));
  const inverted = minCents !== null && maxCents !== null && minCents > maxCents;

  return {
    accountIds: uniqueIds(params.getAll(FILTER_PARAMS.account)),
    categoryIds: uniqueIds(params.getAll(FILTER_PARAMS.category)),
    tagIds: uniqueIds(params.getAll(FILTER_PARAMS.tag)),
    type: isTransactionType(type) ? type : null,
    minCents: inverted ? maxCents : minCents,
    maxCents: inverted ? minCents : maxCents,
    search: (params.get(FILTER_PARAMS.search) ?? "").trim(),
    sort: TRANSACTION_SORTS.includes(sort as TransactionSort) ? (sort as TransactionSort) : "data",
    direction: SORT_DIRECTIONS.includes(direction as SortDirection)
      ? (direction as SortDirection)
      : "desc",
    page: parsePage(params.get(FILTER_PARAMS.page)),
  };
}

export function writeFilters(
  params: URLSearchParams,
  filters: TransactionFilters,
): URLSearchParams {
  for (const key of Object.values(FILTER_PARAMS)) params.delete(key);

  for (const id of filters.accountIds) params.append(FILTER_PARAMS.account, id);
  for (const id of filters.categoryIds) params.append(FILTER_PARAMS.category, id);
  for (const id of filters.tagIds) params.append(FILTER_PARAMS.tag, id);

  if (filters.type) params.set(FILTER_PARAMS.type, filters.type);
  if (filters.minCents !== null)
    params.set(FILTER_PARAMS.min, formatCentsForInput(filters.minCents));
  if (filters.maxCents !== null)
    params.set(FILTER_PARAMS.max, formatCentsForInput(filters.maxCents));
  if (filters.search) params.set(FILTER_PARAMS.search, filters.search);
  if (filters.sort !== "data") params.set(FILTER_PARAMS.sort, filters.sort);
  if (filters.direction !== "desc") params.set(FILTER_PARAMS.direction, filters.direction);
  if (filters.page > 1) params.set(FILTER_PARAMS.page, String(filters.page));

  return params;
}

/** Quantos filtros de conteúdo estão ligados — ordenação e página não contam. */
export function countActiveFilters(filters: TransactionFilters): number {
  return (
    filters.accountIds.length +
    filters.categoryIds.length +
    filters.tagIds.length +
    (filters.type ? 1 : 0) +
    (filters.minCents !== null ? 1 : 0) +
    (filters.maxCents !== null ? 1 : 0) +
    (filters.search ? 1 : 0)
  );
}

export type EntrySummary = {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  /**
   * Quanto andou entre contas próprias, contando só a perna que entra: somar as duas
   * dobraria o valor movimentado. Fica fora de receita e de despesa.
   */
  transferCents: number;
};

/**
 * Transferência **nunca** entra em receita nem em despesa: mover dinheiro entre contas
 * próprias não é ganhar nem gastar, e contá-la infla os dois lados do relatório.
 */
export function summarizeEntries(
  entries: readonly { amountCents: number; type: TransactionType }[],
): EntrySummary {
  const summary: EntrySummary = {
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    transferCents: 0,
  };

  for (const entry of entries) {
    if (entry.type === "TRANSFER") {
      if (entry.amountCents > 0) summary.transferCents += entry.amountCents;
      continue;
    }
    // Estorno é devolução de compra no cartão, não receita: fica fora deste resumo do
    // mesmo jeito que transferência fica — só a fatura do cartão sente o valor dele.
    if (entry.type === "REFUND") continue;

    summary.netCents += entry.amountCents;
    if (entry.amountCents >= 0) summary.incomeCents += entry.amountCents;
    else summary.expenseCents += -entry.amountCents;
  }

  return summary;
}

export type DayGroup<TEntry> = {
  /** Chave `AAAA-MM-DD` do dia em São Paulo. */
  key: string;
  date: Date;
  totalCents: number;
  entries: TEntry[];
};

/** Agrupa preservando a ordem recebida: quem ordena a lista é a query, não esta função. */
export function groupByDay<TEntry extends { date: Date; amountCents: number }>(
  entries: readonly TEntry[],
): DayGroup<TEntry>[] {
  const groups = new Map<string, DayGroup<TEntry>>();

  for (const entry of entries) {
    const { year, month, day } = toDateParts(entry.date);
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    const group = groups.get(key) ?? { key, date: entry.date, totalCents: 0, entries: [] };
    group.totalCents += entry.amountCents;
    group.entries.push(entry);
    groups.set(key, group);
  }

  return [...groups.values()];
}

function uniqueIds(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isTransactionType(value: string | null): value is TransactionType {
  return TRANSACTION_TYPE_VALUES.includes(value as TransactionType);
}

function parseCents(value: string | null): number | null {
  if (value === null || value.trim() === "") return null;

  try {
    const cents = parseBRLInput(value);
    return cents >= 0 ? cents : null;
  } catch {
    return null;
  }
}

function parsePage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;
}
