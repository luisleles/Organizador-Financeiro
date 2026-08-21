import { toDateParts, isoDateKey } from "@/lib/date";
import { findMatchingRule, type MatchableRule } from "@/server/categories/category.rules";
import type { RawTransaction } from "./source";

/**
 * O caminho que todo lançamento importado percorre, seja qual for a fonte:
 * normalizar → deduplicar por (provider, externalId) → aplicar regras de categorização.
 *
 * Módulo puro. Quem chama traz os externalIds que já existem no banco e as regras; aqui só
 * se decide o que cada linha é. Gravar é decisão da tela de revisão, nunca daqui.
 */

export type ImportStatus = "novo" | "duplicado" | "repetido-no-arquivo";

export type PreviewRow = {
  externalId: string;
  /** `AAAA-MM-DD`, que é o formato aceito pelo serviço de transações. */
  date: string;
  description: string;
  amountCents: number;
  type: "INCOME" | "EXPENSE";
  status: ImportStatus;
  categoryId: string | null;
  /** Nome da categoria sugerida, para a tela não ter que cruzar a lista de novo. */
  categoryName: string | null;
  /** Verdadeiro quando a categoria veio de uma regra, e não do arquivo. */
  categorySuggested: boolean;
  rawPayload: unknown;
};

export type ImportPreview = {
  rows: PreviewRow[];
  totals: {
    total: number;
    novos: number;
    duplicados: number;
    semCategoria: number;
    novosCents: number;
  };
};

export type BuildPreviewInput = {
  transactions: readonly RawTransaction[];
  /** Chaves já gravadas para este provider. */
  existingExternalIds: ReadonlySet<string>;
  rules: readonly MatchableRule[];
  categoryNameById: ReadonlyMap<string, string>;
};

export function buildPreview({
  transactions,
  existingExternalIds,
  rules,
  categoryNameById,
}: BuildPreviewInput): ImportPreview {
  const seen = new Set<string>();

  const rows = transactions.map((transaction) => {
    const status = resolveStatus(transaction.externalId, existingExternalIds, seen);
    seen.add(transaction.externalId);

    const matched = findMatchingRule(transaction.description, rules);
    const categoryId = matched?.categoryId ?? null;

    return {
      externalId: transaction.externalId,
      date: isoDateKey(toDateParts(transaction.date)),
      description: transaction.description,
      amountCents: transaction.amountCents,
      type: transaction.amountCents >= 0 ? "INCOME" : "EXPENSE",
      status,
      categoryId,
      categoryName: categoryId ? (categoryNameById.get(categoryId) ?? null) : null,
      categorySuggested: categoryId !== null,
      rawPayload: transaction.rawPayload,
    } satisfies PreviewRow;
  });

  const novos = rows.filter((row) => row.status === "novo");

  return {
    rows,
    totals: {
      total: rows.length,
      novos: novos.length,
      duplicados: rows.length - novos.length,
      semCategoria: novos.filter((row) => row.categoryId === null).length,
      novosCents: novos.reduce((total, row) => total + row.amountCents, 0),
    },
  };
}

function resolveStatus(
  externalId: string,
  existing: ReadonlySet<string>,
  seen: ReadonlySet<string>,
): ImportStatus {
  if (existing.has(externalId)) return "duplicado";
  if (seen.has(externalId)) return "repetido-no-arquivo";
  return "novo";
}
