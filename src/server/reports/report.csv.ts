/**
 * CSV para abrir no Excel em português: separador `;`, decimal com vírgula e BOM no
 * começo. Sem o BOM, o Excel lê UTF-8 como Latin-1 e "Alimentação" vira "AlimentaÃ§Ã£o".
 */
const BOM = "﻿";
const SEPARATOR = ";";

export function toCsv(rows: readonly (readonly string[])[]): string {
  return BOM + rows.map((row) => row.map(escapeCell).join(SEPARATOR)).join("\r\n");
}

export function csvMoney(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function escapeCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
