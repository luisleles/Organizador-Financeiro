import type { TransactionType } from "@prisma/client";
import {
  BUCKET_RULE_MESSAGES,
  validateBucketEntry,
  type BucketAccount,
  type BucketRuleCode,
} from "./account.buckets";

/**
 * Porta única de "o que esta conta aceita lançar". Criação manual, edição, parcelamento,
 * recorrência (Fase 10) e importação (Fase 11) passam todos por `assertOperationAllowed` —
 * a regra não pode viver só no formulário. Cartão de crédito (`class LIABILITY`) só aceita
 * `EXPENSE` e `REFUND`; receita nele vira "Pagar fatura" ou estorno, nunca lançamento
 * direto. Caixinha mantém a regra da Fase 9, inalterada, em `account.buckets.ts`.
 */

export type OperationAccount = BucketAccount;

/**
 * `PAY_INVOICE` é a única exceção à proibição de transferência avulsa com cartão: são as
 * duas pernas que `payInvoice` cria internamente, nunca uma transferência solta escolhida
 * pelo usuário.
 */
export type OperationContext = "STANDARD" | "PAY_INVOICE";

export type OperationRuleCode =
  | "INCOME_ON_CREDIT_CARD"
  | "TRANSFER_ON_CREDIT_CARD"
  | "REFUND_REQUIRES_CREDIT_CARD"
  | BucketRuleCode;

export const OPERATION_RULE_MESSAGES: Record<OperationRuleCode, string> = {
  INCOME_ON_CREDIT_CARD:
    'Cartão de crédito não recebe receita. Para quitar a fatura, use "Pagar fatura"; para devolver o valor de uma compra, registre um estorno.',
  TRANSFER_ON_CREDIT_CARD:
    'Cartão de crédito não participa de transferência avulsa. Para mandar dinheiro para ele, use "Pagar fatura".',
  REFUND_REQUIRES_CREDIT_CARD: "Estorno só existe em conta de cartão de crédito.",
  ...BUCKET_RULE_MESSAGES,
};

export function validateOperation(
  account: OperationAccount,
  type: TransactionType,
  amountCents: number,
  context: OperationContext = "STANDARD",
): OperationRuleCode | null {
  if (account.class === "LIABILITY") {
    if (type === "INCOME") return "INCOME_ON_CREDIT_CARD";
    if (type === "TRANSFER" && context !== "PAY_INVOICE") return "TRANSFER_ON_CREDIT_CARD";
    return null;
  }

  if (type === "REFUND") return "REFUND_REQUIRES_CREDIT_CARD";
  return validateBucketEntry(account, type, amountCents);
}

export class AccountOperationError extends Error {
  constructor(
    readonly code: OperationRuleCode,
    message: string,
  ) {
    super(message);
    this.name = "AccountOperationError";
  }
}

export function assertOperationAllowed(
  account: OperationAccount,
  type: TransactionType,
  amountCents: number,
  context: OperationContext = "STANDARD",
): void {
  const violation = validateOperation(account, type, amountCents, context);
  if (violation) throw new AccountOperationError(violation, OPERATION_RULE_MESSAGES[violation]);
}
