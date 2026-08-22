import type { AccountClass, AccountType } from "@prisma/client";
import type { BalancePoint, ConsolidatedBalance } from "./account.balance";
import type {
  CreditCardCycle,
  CreditCardPosition,
  InvoiceCycleStatus,
  InvoicePaymentStatus,
} from "./account.credit-card";

/** Termos cadastrados do cartão, presentes só quando `type` é `CREDIT_CARD`. */
export type CreditCardTerms = {
  detailsId: string;
  closingDay: number;
  dueDay: number;
  creditLimitCents: number;
  lastFourDigits: string | null;
  brand: string | null;
};

/** Termos mais a posição calculada: fatura, limite disponível, uso e datas do ciclo. */
export type CreditCardStatus = CreditCardTerms & CreditCardPosition & CreditCardCycle;

export type AccountSummary = {
  id: string;
  name: string;
  institution: string | null;
  type: AccountType;
  class: AccountClass;
  color: string;
  icon: string;
  archived: boolean;
  initialBalanceCents: number;
  balanceCents: number;
  transactionCount: number;
  creditCard: CreditCardStatus | null;
  parentAccountId: string | null;
  isBucket: boolean;
  /** Saldo livre, sem o que está nas caixinhas filhas. */
  availableBalanceCents: number;
  /** Disponível mais caixinhas. É este que entra no patrimônio. */
  totalBalanceCents: number;
  /** Caixinhas filhas. Sempre vazio numa caixinha — não há aninhamento. */
  buckets: AccountSummary[];
};

export type AccountListing = {
  accounts: AccountSummary[];
  /** Consolida apenas as contas ativas: conta arquivada não entra no patrimônio. */
  consolidated: ConsolidatedBalance;
  /**
   * Soma do `currentDebtCents` de cada cartão ativo: o que já está lançado na fatura em
   * aberto e vai fechar no próximo ciclo, ainda que o total da fatura não tenha vencido.
   * É a informação que o regime de caixa esconde — separado de `consolidated` porque não
   * é saldo nem passivo consolidado, é uma data.
   */
  dueAtNextClosingCents: number;
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
  installmentNumber: number | null;
  installmentTotal: number | null;
};

export type AccountInvoice = {
  id: string;
  referenceMonth: Date;
  closingDate: Date;
  dueDate: Date;
  /** Se ainda aceita lançamento novo — vem só do fechamento, nunca do pagamento. */
  cycleStatus: InvoiceCycleStatus;
  paymentStatus: InvoicePaymentStatus;
  paidAt: Date | null;
  paymentTransferGroupId: string | null;
  totalCents: number;
  entries: AccountEntry[];
};

export type AccountDetail = {
  account: AccountSummary;
  /** Do mais recente para o mais antigo, como o extrato é lido. */
  entries: AccountEntry[];
  /** Do mais antigo para o mais recente, como o gráfico é desenhado. */
  balanceSeries: BalancePoint[];
  /**
   * Só para cartão: o mesmo extrato agrupado pela fatura em que cada lançamento cai, da
   * mais recente para a mais antiga. `null` em conta que não é cartão.
   */
  invoices: AccountInvoice[] | null;
};
