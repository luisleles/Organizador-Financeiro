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

export type ConsolidatedBalance = {
  /** Patrimônio líquido: ativos menos passivos. */
  totalCents: number;
  /** Soma apenas das contas com saldo positivo. */
  assetsCents: number;
  /** Soma, em módulo, das contas com saldo negativo — cartão de crédito, cheque especial. */
  liabilitiesCents: number;
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

export function consolidateBalances(balancesCents: readonly number[]): ConsolidatedBalance {
  return balancesCents.reduce<ConsolidatedBalance>(
    (totals, balanceCents) => ({
      totalCents: totals.totalCents + balanceCents,
      assetsCents: totals.assetsCents + Math.max(balanceCents, 0),
      liabilitiesCents: totals.liabilitiesCents + Math.max(-balanceCents, 0),
    }),
    { totalCents: 0, assetsCents: 0, liabilitiesCents: 0 },
  );
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
