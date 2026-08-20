import type { Adherence, BudgetProgress } from "./budget.pace";

export type BudgetRow = {
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  hasChildren: boolean;
  progress: BudgetProgress;
};

export type BudgetTotals = {
  limitCents: number;
  spentCents: number;
  progress: BudgetProgress;
  overCount: number;
};

export type MonthlyBudgets = {
  month: string;
  /** Quanto do mês já passou, de 0 a 1 — a base do ritmo esperado. */
  monthProgress: number;
  rows: BudgetRow[];
  totals: BudgetTotals;
  /** Categorias ativas ainda sem limite neste mês. */
  unbudgeted: { id: string; name: string }[];
};

export type BudgetHistoryRow = {
  categoryId: string;
  name: string;
  months: Adherence[];
};

export type BudgetHistory = {
  months: string[];
  rows: BudgetHistoryRow[];
};
