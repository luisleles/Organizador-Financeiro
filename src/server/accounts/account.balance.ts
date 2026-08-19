/**
 * Regras de saldo, isoladas de Prisma e de React para poderem ser testadas sozinhas.
 *
 * Convenção do domínio: `amountCents` é **assinado**. Entrada é positiva, saída é
 * negativa, e uma transferência são duas linhas de sinais opostos e mesmo módulo. Por
 * isso o saldo é uma soma simples, e é essa convenção que faz o total consolidado ficar
 * inalterado quando se move dinheiro entre duas contas próprias.
 */

export type MovementEntry = {
  amountCents: number;
};

export type DatedMovementEntry = MovementEntry & {
  date: Date;
};

export type BalancePoint = {
  date: Date;
  balanceCents: number;
};

export type ConsolidationEntry = {
  balanceCents: number;
  isCreditCard: boolean;
};

export type ConsolidatedBalance = {
  /**
   * Saldo em contas: tudo que não é dívida de cartão. Inclui o crédito de um cartão pago
   * a mais, que é dinheiro disponível, para que `netCents` continue sendo exatamente a
   * soma dos saldos de todas as contas.
   */
  accountsBalanceCents: number;
  /** Faturas em aberto, em módulo. Sempre `>= 0`. */
  openInvoicesCents: number;
  /** Saldo líquido: contas menos faturas. */
  netCents: number;
};

export function sumMovementCents(entries: readonly MovementEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}

export function accountBalanceCents(initialBalanceCents: number, movementCents: number): number {
  return initialBalanceCents + movementCents;
}

export function calculateBalanceCents(
  initialBalanceCents: number,
  entries: readonly MovementEntry[],
): number {
  return accountBalanceCents(initialBalanceCents, sumMovementCents(entries));
}

/**
 * O limite disponível de um cartão **nunca** entra aqui: limite é crédito de terceiro, não
 * patrimônio. O cartão participa apenas pela dívida, que é negativa.
 */
export function consolidateBalances(entries: readonly ConsolidationEntry[]): ConsolidatedBalance {
  let accountsBalanceCents = 0;
  let openInvoicesCents = 0;

  for (const entry of entries) {
    const isDebt = entry.isCreditCard && entry.balanceCents < 0;
    if (isDebt) {
      openInvoicesCents += -entry.balanceCents;
    } else {
      accountsBalanceCents += entry.balanceCents;
    }
  }

  return {
    accountsBalanceCents,
    openInvoicesCents,
    netCents: accountsBalanceCents - openInvoicesCents,
  };
}

/**
 * Saldo acumulado ponto a ponto, do mais antigo ao mais recente. `openingBalanceCents` é
 * o saldo imediatamente antes da primeira entrada da lista — normalmente o saldo atual
 * menos a soma das entradas exibidas, quando só um recorte do extrato é carregado.
 */
export function buildBalanceSeries(
  openingBalanceCents: number,
  entries: readonly DatedMovementEntry[],
): BalancePoint[] {
  let runningCents = openingBalanceCents;

  return entries.map((entry) => {
    runningCents += entry.amountCents;
    return { date: entry.date, balanceCents: runningCents };
  });
}

/** Saldo de onde a série começa, dado o saldo atual e o recorte de extrato exibido. */
export function openingBalanceCents(
  currentBalanceCents: number,
  entries: readonly MovementEntry[],
): number {
  return currentBalanceCents - sumMovementCents(entries);
}
