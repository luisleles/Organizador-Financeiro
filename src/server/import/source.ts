/**
 * A fronteira que todo lugar de onde vêm lançamentos precisa atravessar. Hoje são arquivos
 * — CSV e OFX —, amanhã é Open Finance: uma fonte nova implementa esta interface e ganha de
 * graça a normalização, a deduplicação, as regras de categorização e a tela de revisão.
 *
 * A fonte só sabe buscar e devolver o que leu. Ela não conhece Prisma, não decide o que é
 * duplicado e nunca grava nada.
 */

export type RawTransaction = {
  /** Identidade estável do lançamento na origem. É o que impede importar duas vezes. */
  externalId: string;
  date: Date;
  description: string;
  /** Inteiro em centavos, com sinal: negativo é saída. */
  amountCents: number;
  /** O registro cru como veio, guardado para depuração e para não perder informação. */
  rawPayload: unknown;
};

export type FetchTransactionsParams = {
  accountId: string;
  since: Date;
};

export interface TransactionSource {
  /** Vai para `Transaction.provider`: junto com `externalId`, é a chave da deduplicação. */
  id: string;
  fetchTransactions(params: FetchTransactionsParams): Promise<RawTransaction[]>;
}
