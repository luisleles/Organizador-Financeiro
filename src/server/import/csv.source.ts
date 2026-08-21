import { fromZonedParts } from "@/lib/date";
import {
  parseAmountCents,
  parseDateParts,
  parseDelimited,
  type DateFormat,
  type Delimiter,
} from "./csv.parse";
import { stableExternalId } from "./external-id";
import type { FetchTransactionsParams, RawTransaction, TransactionSource } from "./source";

export type CsvColumnMapping = {
  date: number;
  description: number;
  /** Coluna de valor único, com sinal. */
  amount: number;
  /** Extratos que separam entrada e saída em duas colunas usam estas duas no lugar. */
  credit?: number;
  debit?: number;
  /** Coluna de identificador da própria origem, quando o arquivo traz uma. */
  externalId?: number;
};

export type CsvSourceOptions = {
  text: string;
  mapping: CsvColumnMapping;
  dateFormat: DateFormat;
  delimiter?: Delimiter;
  /** Quantas linhas do topo são cabeçalho. */
  headerRows?: number;
};

/**
 * Extrato em CSV. O mapeamento de colunas vem da tela, porque cada banco exporta de um
 * jeito e adivinhar em silêncio é pior do que perguntar.
 */
export class CsvSource implements TransactionSource {
  readonly id = "csv";

  constructor(private readonly options: CsvSourceOptions) {}

  async fetchTransactions({ since }: FetchTransactionsParams): Promise<RawTransaction[]> {
    const { text, mapping, dateFormat, delimiter, headerRows = 1 } = this.options;
    const linhas = parseDelimited(text, delimiter).slice(headerRows);
    const ocorrencias = new Map<string, number>();

    const lidas = linhas.flatMap((linha) => {
      const partes = parseDateParts(cell(linha, mapping.date), dateFormat);
      const amountCents = amountFrom(linha, mapping);
      const description = cell(linha, mapping.description);

      if (!partes || amountCents === null || description === "") return [];

      const date = fromZonedParts(partes);
      const doArquivo = mapping.externalId === undefined ? "" : cell(linha, mapping.externalId);

      const base =
        doArquivo !== ""
          ? doArquivo
          : stableExternalId([partes.year, partes.month, partes.day, description, amountCents]);

      // Duas linhas idênticas no mesmo extrato são dois lançamentos de verdade — o mesmo
      // café comprado duas vezes no mesmo dia. O contador mantém as duas.
      const repeticao = ocorrencias.get(base) ?? 0;
      ocorrencias.set(base, repeticao + 1);

      return [
        {
          externalId: repeticao === 0 ? base : `${base}-${repeticao}`,
          date,
          description,
          amountCents,
          rawPayload: linha,
        } satisfies RawTransaction,
      ];
    });

    return lidas.filter((transaction) => transaction.date >= since);
  }
}

function amountFrom(linha: readonly string[], mapping: CsvColumnMapping): number | null {
  if (mapping.credit !== undefined || mapping.debit !== undefined) {
    const credito =
      mapping.credit === undefined ? null : parseAmountCents(cell(linha, mapping.credit));
    const debito =
      mapping.debit === undefined ? null : parseAmountCents(cell(linha, mapping.debit));

    if (credito) return Math.abs(credito);
    if (debito) return -Math.abs(debito);
    return null;
  }

  return parseAmountCents(cell(linha, mapping.amount));
}

function cell(linha: readonly string[], index: number): string {
  return (linha[index] ?? "").trim();
}
