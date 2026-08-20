import type { AccountClass, AccountType, TransactionType } from "@prisma/client";

/**
 * Regras da caixinha (`SAVINGS_BUCKET`): uma subconta de uma conta de ativo que serve de
 * lastro para uma meta. O ponto do modelo é que o progresso da meta **é saldo de verdade**
 * no ledger, e não anotação — então o que pode entrar e sair de uma caixinha precisa ser
 * fechado, e é aqui que fica fechado.
 */

export const BUCKET_TYPE = "SAVINGS_BUCKET" satisfies AccountType;

export type BucketAccount = {
  id: string;
  type: AccountType;
  class: AccountClass;
  parentAccountId: string | null;
};

export type BucketRuleCode =
  | "PARENT_REQUIRED"
  | "PARENT_NOT_ALLOWED"
  | "PARENT_MUST_BE_ASSET"
  | "PARENT_IS_BUCKET"
  | "SELF_PARENT"
  | "BUCKET_MUST_USE_PARENT"
  | "BUCKET_TO_BUCKET"
  | "BUCKET_TO_CREDIT_CARD"
  | "LOOSE_ENTRY_IN_BUCKET";

export const BUCKET_RULE_MESSAGES: Record<BucketRuleCode, string> = {
  PARENT_REQUIRED: "Uma caixinha precisa de uma conta mãe.",
  PARENT_NOT_ALLOWED: "Só caixinha pode ter conta mãe.",
  PARENT_MUST_BE_ASSET: "A conta mãe precisa ser de ativo — cartão de crédito não serve.",
  PARENT_IS_BUCKET: "Caixinha não pode ficar dentro de outra caixinha.",
  SELF_PARENT: "Uma conta não pode ser mãe de si mesma.",
  BUCKET_MUST_USE_PARENT: "Uma caixinha só movimenta dinheiro com a própria conta mãe.",
  BUCKET_TO_BUCKET: "Não dá para transferir de uma caixinha direto para outra.",
  BUCKET_TO_CREDIT_CARD: "Caixinha não movimenta dinheiro com cartão de crédito.",
  LOOSE_ENTRY_IN_BUCKET:
    "Dentro de uma caixinha só entram aportes, resgates e rendimento — não lançamento avulso.",
};

export function isBucket(account: Pick<BucketAccount, "type">): boolean {
  return account.type === BUCKET_TYPE;
}

/** Valida o vínculo mãe/filha na criação e na edição de conta. */
export function validateBucketParent(
  account: { id?: string; type: AccountType },
  parent: BucketAccount | null,
): BucketRuleCode | null {
  if (!isBucket(account)) return parent === null ? null : "PARENT_NOT_ALLOWED";

  if (parent === null) return "PARENT_REQUIRED";
  if (account.id && parent.id === account.id) return "SELF_PARENT";
  if (isBucket(parent)) return "PARENT_IS_BUCKET";
  if (parent.class !== "ASSET") return "PARENT_MUST_BE_ASSET";

  return null;
}

/**
 * Toda transferência que envolve caixinha precisa ter a conta mãe do outro lado. As duas
 * pontas são checadas, porque o erro pode estar em qualquer uma delas.
 */
export function validateBucketTransfer(
  from: BucketAccount,
  to: BucketAccount,
): BucketRuleCode | null {
  const fromIsBucket = isBucket(from);
  const toIsBucket = isBucket(to);

  if (!fromIsBucket && !toIsBucket) return null;
  if (fromIsBucket && toIsBucket) return "BUCKET_TO_BUCKET";

  const bucket = fromIsBucket ? from : to;
  const other = fromIsBucket ? to : from;

  if (other.class !== "ASSET") return "BUCKET_TO_CREDIT_CARD";
  if (bucket.parentAccountId !== other.id) return "BUCKET_MUST_USE_PARENT";

  return null;
}

/**
 * O que pode ser lançado direto numa caixinha. Despesa avulsa não pode: dinheiro só sai
 * de caixinha voltando para a mãe, e é isso que mantém o saldo dela auditável.
 */
export function validateBucketEntry(
  account: BucketAccount,
  type: TransactionType,
  amountCents: number,
): BucketRuleCode | null {
  if (!isBucket(account)) return null;
  if (type === "TRANSFER") return null;
  if (type === "INCOME" && amountCents > 0) return null;

  return "LOOSE_ENTRY_IN_BUCKET";
}

export type ParentBalance = {
  /** Saldo que a conta mãe tem livre, sem o dinheiro guardado nas caixinhas. */
  availableCents: number;
  /** Soma dos saldos das caixinhas filhas. */
  bucketsCents: number;
  /** Disponível mais caixinhas. É este que entra no patrimônio consolidado. */
  totalCents: number;
};

/**
 * O saldo da mãe e o das caixinhas são independentes no ledger: a transferência já tirou
 * o dinheiro de um e pôs no outro. Somar os dois dá o total **sem contar duas vezes**.
 */
export function splitParentBalance(
  ownBalanceCents: number,
  bucketBalancesCents: readonly number[],
): ParentBalance {
  const bucketsCents = bucketBalancesCents.reduce((total, balance) => total + balance, 0);

  return {
    availableCents: ownBalanceCents,
    bucketsCents,
    totalCents: ownBalanceCents + bucketsCents,
  };
}

export type BucketComposition = {
  balanceCents: number;
  /** Soma das pernas de transferência que entraram: o que foi aportado. */
  totalDepositedCents: number;
  /** Soma das entradas de rendimento. Dinheiro novo, não aporte. */
  totalYieldCents: number;
};

export function decomposeBucketBalance(
  initialBalanceCents: number,
  entries: readonly { type: TransactionType; amountCents: number }[],
): BucketComposition {
  let balanceCents = initialBalanceCents;
  let totalDepositedCents = initialBalanceCents;
  let totalYieldCents = 0;

  for (const entry of entries) {
    balanceCents += entry.amountCents;

    if (entry.type === "INCOME") totalYieldCents += entry.amountCents;
    else if (entry.type === "TRANSFER") totalDepositedCents += entry.amountCents;
  }

  return { balanceCents, totalDepositedCents, totalYieldCents };
}
