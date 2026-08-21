/**
 * Leitor de CSV que aguenta o que sai de banco brasileiro: separador `;` ou `,`, campos
 * entre aspas com separador dentro, aspas escapadas dobradas e quebra de linha CRLF ou LF.
 */

const DELIMITERS = [";", ",", "\t"] as const;

export type Delimiter = (typeof DELIMITERS)[number];

/** O separador mais frequente fora das aspas na primeira linha. */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  let melhor: Delimiter = ";";
  let maior = 0;

  for (const delimiter of DELIMITERS) {
    const total = countOutsideQuotes(firstLine, delimiter);
    if (total > maior) {
      maior = total;
      melhor = delimiter;
    }
  }

  return melhor;
}

export function parseDelimited(
  text: string,
  delimiter: Delimiter = detectDelimiter(text),
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  const semBom = text.replace(/^﻿/, "");

  for (let index = 0; index < semBom.length; index += 1) {
    const char = semBom[index];

    if (quoted) {
      if (char === '"') {
        if (semBom[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  // Linha em branco no fim de arquivo é ruído, não um lançamento vazio.
  return rows.filter((linha) => linha.some((celula) => celula !== ""));
}

/** Aceita "1.234,56", "1,234.56", "-45,90" e "45.90-", que aparecem conforme o banco. */
export function parseAmountCents(value: string): number | null {
  const limpo = value.replace(/\s|R\$| /g, "").trim();
  if (limpo === "") return null;

  const negativo = limpo.startsWith("-") || limpo.endsWith("-") || /^\(.*\)$/.test(limpo);
  const digits = limpo.replace(/[()\-+]/g, "");
  if (!/[0-9]/.test(digits)) return null;

  const ultimaVirgula = digits.lastIndexOf(",");
  const ultimoPonto = digits.lastIndexOf(".");
  const separador = ultimaVirgula > ultimoPonto ? "," : ".";

  const [inteira, decimal = ""] = splitOnLast(digits, separador);
  const inteiraLimpa = inteira.replace(/[^0-9]/g, "");
  const decimalLimpa = decimal
    .replace(/[^0-9]/g, "")
    .padEnd(2, "0")
    .slice(0, 2);

  if (inteiraLimpa === "" && decimalLimpa === "") return null;

  const cents = Number(inteiraLimpa || "0") * 100 + Number(decimalLimpa || "0");
  return negativo ? -cents : cents;
}

export const DATE_FORMATS = ["DD/MM/AAAA", "AAAA-MM-DD", "MM/DD/AAAA"] as const;

export type DateFormat = (typeof DATE_FORMATS)[number];

/** Devolve `AAAA-MM-DD` em partes, sem instante: fuso é problema de quem for gravar. */
export function parseDateParts(
  value: string,
  format: DateFormat,
): { year: number; month: number; day: number } | null {
  const numeros = value.match(/\d+/g);
  if (!numeros || numeros.length < 3) return null;

  const [a, b, c] = numeros.map(Number);
  const partes =
    format === "AAAA-MM-DD"
      ? { year: a, month: b, day: c }
      : format === "MM/DD/AAAA"
        ? { year: c, month: a, day: b }
        : { year: c, month: b, day: a };

  if (partes.year < 1970 || partes.month < 1 || partes.month > 12) return null;
  if (partes.day < 1 || partes.day > 31) return null;

  return partes;
}

function splitOnLast(value: string, separador: string): [string, string?] {
  const posicao = value.lastIndexOf(separador);
  if (posicao === -1) return [value];
  return [value.slice(0, posicao), value.slice(posicao + 1)];
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let total = 0;
  let quoted = false;

  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) total += 1;
  }

  return total;
}
