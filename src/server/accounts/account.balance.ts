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
  /** `class LIABILITY` — hoje, só cartão de crédito. */
  isCreditCard: boolean;
};

export type ConsolidatedBalance = {
  assetsBalanceCents: number;
  liabilitiesBalanceCents: number;
  netWorthCents: number;
  /** `Math.abs(liabilitiesBalanceCents)`: a mesma dívida, só que exibida como número positivo. */
  openInvoicesCents: number;
};

export function sumMovementCents(entries: readonly MovementEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amountCents, 0);
}

/**
 * Soma só o que é ativo: toda conta `class ASSET`, caixinha incluída — sem dobrar com a
 * conta mãe, porque a transferência para a caixinha já reduziu o saldo da mãe no próprio
 * lançamento, não há o que descontar de novo aqui. Um cartão pago a mais entra por aqui
 * também, pelo crédito que sobrou: é dinheiro disponível, não dívida.
 *
 * `creditLimitCents` e `availableLimitCents` **nunca** entram nesta soma: limite é crédito
 * que o banco oferece, não algo que a pessoa tem — não é patrimônio.
 */
export function assetsBalanceCents(entries: readonly ConsolidationEntry[]): number {
  return entries.reduce(
    (total, entry) =>
      total + (entry.isCreditCard ? Math.max(entry.balanceCents, 0) : entry.balanceCents),
    0,
  );
}

/**
 * Soma só o que é passivo: toda conta `class LIABILITY`, sempre `<= 0`. Um cartão pago a
 * mais nunca aparece aqui como passivo positivo — o excedente dele já foi contado em
 * `assetsBalanceCents`.
 *
 * Mesma regra de `assetsBalanceCents`: `creditLimitCents` e `availableLimitCents` nunca
 * entram nesta soma.
 */
export function liabilitiesBalanceCents(entries: readonly ConsolidationEntry[]): number {
  return entries.reduce(
    (total, entry) => total + (entry.isCreditCard ? Math.min(entry.balanceCents, 0) : 0),
    0,
  );
}

/**
 * Patrimônio líquido: ativo mais passivo, que já vem negativo. Por vir só destas duas
 * funções, `netWorthCents` herda a mesma garantia — limite de cartão não é patrimônio e
 * não entra aqui.
 */
export function netWorthCents(entries: readonly ConsolidationEntry[]): number {
  return assetsBalanceCents(entries) + liabilitiesBalanceCents(entries);
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

/** Atalho para pegar as três grandezas de uma vez, sem repetir a soma de cada uma. */
export function consolidateBalances(entries: readonly ConsolidationEntry[]): ConsolidatedBalance {
  const assets = assetsBalanceCents(entries);
  const liabilities = liabilitiesBalanceCents(entries);

  return {
    assetsBalanceCents: assets,
    liabilitiesBalanceCents: liabilities,
    netWorthCents: assets + liabilities,
    openInvoicesCents: Math.abs(liabilities),
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
