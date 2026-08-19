const BRL_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatCurrency(cents: number): string {
  return BRL_FORMATTER.format(cents / 100);
}

export function toCents(reais: number): number {
  return Math.round(reais * 100);
}
