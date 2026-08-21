import { toDateParts } from "@/lib/date";
import { stableExternalId } from "./external-id";
import { parseOfx } from "./ofx.parse";
import type { FetchTransactionsParams, RawTransaction, TransactionSource } from "./source";

export type OfxSourceOptions = {
  text: string;
};

/**
 * Extrato em OFX, o formato que quase todo banco brasileiro ainda exporta. Diferente do
 * CSV, aqui não há mapeamento a fazer: o arquivo já diz o que é data, valor e histórico —
 * e traz o `FITID`, que é exatamente a identidade estável que a deduplicação quer.
 */
export class OfxSource implements TransactionSource {
  readonly id = "ofx";

  constructor(private readonly options: OfxSourceOptions) {}

  async fetchTransactions({ since }: FetchTransactionsParams): Promise<RawTransaction[]> {
    return parseOfx(this.options.text)
      .map((transaction) => {
        const partes = toDateParts(transaction.date);

        return {
          // Sem FITID, cai na mesma identidade calculada do CSV.
          externalId:
            transaction.fitId ||
            stableExternalId([
              partes.year,
              partes.month,
              partes.day,
              transaction.description,
              transaction.amountCents,
            ]),
          date: transaction.date,
          description: transaction.description,
          amountCents: transaction.amountCents,
          rawPayload: transaction.raw,
        } satisfies RawTransaction;
      })
      .filter((transaction) => transaction.date >= since);
  }
}
