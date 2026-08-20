import type { TransactionType } from "@prisma/client";
import type { EntrySummary } from "./transaction.filters";

export type TagRef = {
  id: string;
  name: string;
  color: string;
};

export type TransactionRow = {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  type: TransactionType;
  accountId: string;
  accountName: string;
  accountColor: string;
  categoryId: string | null;
  categoryName: string | null;
  tags: TagRef[];
  transferGroupId: string | null;
  invoiceId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  notes: string | null;
};

export type TransactionListing = {
  rows: TransactionRow[];
  totalCount: number;
  pageCount: number;
  page: number;
  /** Resumo de todo o recorte filtrado, não só da página exibida. */
  summary: EntrySummary;
};

export type FilterOptions = {
  accounts: {
    id: string;
    name: string;
    color: string;
    type: "CHECKING" | "SAVINGS" | "CREDIT_CARD" | "INVESTMENT" | "CASH";
    class: "ASSET" | "LIABILITY";
  }[];
  transferAccounts: { id: string; name: string; color: string }[];
  categories: { id: string; name: string; kind: "INCOME" | "EXPENSE" }[];
  tags: TagRef[];
};

/** Histórico usado pelo autocomplete: a descrição e a categoria da última vez que ela apareceu. */
export type DescriptionSuggestion = {
  description: string;
  categoryId: string | null;
  accountId: string;
  amountCents: number;
};
