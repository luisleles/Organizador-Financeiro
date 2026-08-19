const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

export function formatBRL(cents: number): string {
  return BRL_FORMATTER.format(fromCents(cents));
}

/**
 * Converte texto digitado por um usuário brasileiro (ex: "R$ 1.234,56", "1234,56",
 * "-50,00") em centavos. Quando ponto e vírgula aparecem juntos, assume o padrão BR
 * (ponto separa milhar, vírgula separa decimais); quando só um dos dois aparece, é
 * tratado como separador decimal.
 */
export function parseBRLInput(input: string): number {
  const trimmed = input.trim();
  const isNegative = trimmed.startsWith("-");
  const digitsOnly = trimmed.replace(/[^\d,.-]/g, "").replace("-", "");

  const hasComma = digitsOnly.includes(",");
  const hasDot = digitsOnly.includes(".");

  const normalized =
    hasComma && hasDot
      ? digitsOnly.replace(/\./g, "").replace(",", ".")
      : hasComma
        ? digitsOnly.replace(",", ".")
        : digitsOnly;

  const value = Number.parseFloat(normalized);
  if (Number.isNaN(value)) {
    throw new Error(`Valor monetário inválido: "${input}"`);
  }

  return toCents(isNegative ? -value : value);
}
