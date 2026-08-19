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

const DECIMAL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type MoneyParts = {
  /** Sinal explícito; usa o menos tipográfico (U+2212), que alinha com os dígitos. */
  sign: "+" | "−" | "";
  whole: string;
  fraction: string;
};

/**
 * Separa reais de centavos para que a coluna de valores possa renderizar os centavos
 * menores e mais claros sem perder o alinhamento da vírgula.
 */
export function formatBRLParts(cents: number): MoneyParts {
  const sign = cents > 0 ? "+" : cents < 0 ? "−" : "";
  const [whole = "0", fraction = "00"] = DECIMAL_FORMATTER.format(Math.abs(fromCents(cents))).split(
    ",",
  );

  return { sign, whole, fraction };
}
