import type { CategoryKind } from "@prisma/client";
import type { CategoryNode, FlatCategory } from "./category.tree";
import type { MonthlyTotal, PeriodComparison } from "./category.stats";

export type CategorySummary = FlatCategory & {
  /** Lançamentos ligados diretamente a esta categoria, sem contar as filhas. */
  transactionCount: number;
};

export type CategoryTree = CategoryNode<CategorySummary>[];

export type CategoryListing = {
  tree: CategoryTree;
  archived: CategorySummary[];
  flat: CategorySummary[];
};

export type CategoryRuleRow = {
  id: string;
  pattern: string;
  categoryId: string;
  categoryName: string;
  priority: number;
  active: boolean;
};

export type CategoryEntry = {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  accountName: string;
  subcategoryName: string | null;
};

export type CategoryDetail = {
  category: CategorySummary;
  kind: CategoryKind;
  /** Subcategorias, quando a categoria é um pai. */
  children: CategorySummary[];
  /** Total do período, somado em módulo, incluindo o que caiu nas subcategorias. */
  periodTotalCents: number;
  comparison: PeriodComparison;
  monthly: MonthlyTotal[];
  entries: CategoryEntry[];
};

export type TagSummary = {
  id: string;
  name: string;
  color: string;
  transactionCount: number;
};
