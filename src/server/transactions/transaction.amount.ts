import { parseBRLInput } from "@/lib/money";

/**
 * Aceita o que uma pessoa digita de verdade num campo de valor: "1.234,56", "12,50+8",
 * "3*12,50". Só `+`, `-` e `*`, sem parênteses e sem divisão — é uma calculadora de
 * conferência de conta, não uma linguagem.
 *
 * A multiplicação é feita em centavos e dividida por 100 no fim, então "3*12,50" e
 * "12,50*3" dão o mesmo R$ 37,50, sem depender de qual fator veio primeiro.
 */

const TOKEN = /(\d[\d.,]*)|([+\-*])/g;

type Token = { kind: "number"; cents: number } | { kind: "operator"; value: "+" | "-" | "*" };

export class AmountExpressionError extends Error {
  constructor(message = "Valor inválido") {
    super(message);
    this.name = "AmountExpressionError";
  }
}

export function evaluateAmountExpression(input: string): number {
  const tokens = tokenize(input);
  if (tokens.length === 0) throw new AmountExpressionError();

  const terms = splitTerms(tokens);
  return terms.reduce((total, term) => total + term.signal * multiplyFactors(term.factors), 0);
}

function tokenize(input: string): Token[] {
  const normalized = input.replace(/R\$/gi, "").replace(/\s+/g, "");
  const tokens: Token[] = [];
  let consumed = 0;

  for (const match of normalized.matchAll(TOKEN)) {
    if (match.index !== consumed) throw new AmountExpressionError();
    consumed = match.index + match[0].length;

    if (match[1] !== undefined) {
      tokens.push({ kind: "number", cents: parseNumber(match[1]) });
    } else {
      tokens.push({ kind: "operator", value: match[2] as "+" | "-" | "*" });
    }
  }

  if (consumed !== normalized.length) throw new AmountExpressionError();
  return tokens;
}

function parseNumber(raw: string): number {
  try {
    return parseBRLInput(raw);
  } catch {
    throw new AmountExpressionError();
  }
}

type Term = { signal: 1 | -1; factors: number[] };

function splitTerms(tokens: readonly Token[]): Term[] {
  const terms: Term[] = [];
  let signal: 1 | -1 = 1;
  let factors: number[] = [];
  let expectingNumber = true;

  for (const token of tokens) {
    if (token.kind === "number") {
      if (!expectingNumber) throw new AmountExpressionError();
      factors.push(token.cents);
      expectingNumber = false;
      continue;
    }

    if (expectingNumber) {
      // Um sinal antes do primeiro número é sinal, não operação: "-12,50".
      if (token.value === "-" && factors.length === 0 && terms.length === 0) {
        signal = -1;
        continue;
      }
      throw new AmountExpressionError();
    }

    if (token.value === "*") {
      expectingNumber = true;
      continue;
    }

    terms.push({ signal, factors });
    signal = token.value === "-" ? -1 : 1;
    factors = [];
    expectingNumber = true;
  }

  if (expectingNumber) throw new AmountExpressionError();
  terms.push({ signal, factors });
  return terms;
}

function multiplyFactors(factors: readonly number[]): number {
  return factors.reduce((product, factor, index) =>
    index === 0 ? factor : Math.round((product * factor) / 100),
  );
}
