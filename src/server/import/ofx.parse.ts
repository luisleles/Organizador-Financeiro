import { fromZonedParts } from "@/lib/date";

/**
 * OFX é SGML: as tags de valor não fecham, e a hierarquia é dada por indentação e por
 * blocos `<STMTTRN>`. Por isso a leitura é por bloco e por tag, e não por XML.
 */

export type OfxTransaction = {
  fitId: string;
  date: Date;
  description: string;
  amountCents: number;
  type: string | null;
  raw: Record<string, string>;
};

const TRANSACTION_BLOCK = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
const TAG = /<([A-Z0-9.]+)>([^<\r\n]*)/gi;

export function parseOfx(text: string): OfxTransaction[] {
  const transacoes: OfxTransaction[] = [];

  for (const bloco of text.matchAll(TRANSACTION_BLOCK)) {
    const campos = tagsOf(bloco[1]);
    const date = parseOfxDate(campos.DTPOSTED ?? campos.DTUSER ?? "");
    const amountCents = parseOfxAmount(campos.TRNAMT ?? "");

    if (!date || amountCents === null) continue;

    transacoes.push({
      fitId: campos.FITID ?? "",
      date,
      description: (campos.MEMO || campos.NAME || "Lançamento importado").trim(),
      amountCents,
      type: campos.TRNTYPE ?? null,
      raw: campos,
    });
  }

  return transacoes;
}

/** `20260815`, `20260815120000` e `20260815120000[-3:BRT]` são o mesmo dia. */
export function parseOfxDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return fromZonedParts({ year, month, day });
}

/** O OFX usa ponto decimal; o sinal vem no próprio número. */
export function parseOfxAmount(value: string): number | null {
  const limpo = value.trim().replace(/\s/g, "");
  if (!/^[+-]?\d+([.,]\d+)?$/.test(limpo)) return null;

  const negativo = limpo.startsWith("-");
  const [inteira, decimal = ""] = limpo.replace(/^[+-]/, "").split(/[.,]/);
  const cents = Number(inteira) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));

  return negativo ? -cents : cents;
}

function tagsOf(bloco: string): Record<string, string> {
  const campos: Record<string, string> = {};

  for (const tag of bloco.matchAll(TAG)) {
    const nome = tag[1].toUpperCase();
    const valor = tag[2].trim();
    if (valor !== "" && campos[nome] === undefined) campos[nome] = valor;
  }

  return campos;
}
