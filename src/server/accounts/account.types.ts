import type { AccountType } from "@prisma/client";
import type { BalancePoint, ConsolidatedBalance } from "./account.balance";

/** Dados de fatura, presentes só quando `type` é `CREDIT_CARD`. */
export type CreditCardTerms = {
  closingDay: number;
  dueDay: number;
  creditLimitCents: number;
};

export type AccountSummary = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  color: string;
  icon: string;
  archived: boolean;
  initialBalanceCents: number;
  balanceCents: number;
  transactionCount: number;
  creditCard: CreditCardTerms | null;
};

export type AccountListing = {
  accounts: AccountSummary[];
  /** Consolida apenas as contas ativas: conta arquivada não entra no patrimônio. */
  consolidated: ConsolidatedBalance;
};

export type AccountEntry = {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  categoryName: string | null;
  isTransfer: boolean;
};

export type AccountDetail = {
  account: AccountSummary;
  /** Do mais recente para o mais antigo, como o extrato é lido. */
  entries: AccountEntry[];
  /** Do mais antigo para o mais recente, como o gráfico é desenhado. */
  balanceSeries: BalancePoint[];
};
