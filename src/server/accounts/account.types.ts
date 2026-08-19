import type { AccountType } from "@prisma/client";
import type { BalancePoint, ConsolidatedBalance } from "./account.balance";
import type { CreditCardCycle, CreditCardPosition } from "./account.credit-card";

/** Termos cadastrados do cartão, presentes só quando `type` é `CREDIT_CARD`. */
export type CreditCardTerms = {
  closingDay: number;
  dueDay: number;
  creditLimitCents: number;
};

/** Termos mais a posição calculada: fatura, limite disponível, uso e datas do ciclo. */
export type CreditCardStatus = CreditCardTerms & CreditCardPosition & CreditCardCycle;

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
  creditCard: CreditCardStatus | null;
};

export type AccountListing = {
  accounts: AccountSummary[];
  /** Consolida apenas as contas ativas: conta arquivada não entra no patrimônio. */
  consolidated: ConsolidatedBalance;
};

export function isCreditCard(account: AccountSummary): boolean {
  return account.type === "CREDIT_CARD";
}

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
