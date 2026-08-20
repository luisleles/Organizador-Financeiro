import { formatBRL } from "@/lib/money";
import { formatMonthLabel, type MonthlyTotal } from "@/server/categories/category.stats";

type MonthlyChartProps = {
  months: readonly MonthlyTotal[];
  masked?: boolean;
};

/**
 * Barras em CSS, não em SVG: são poucas, o rótulo precisa herdar a fonte tabular do
 * design system e assim o gráfico continua legível quando a fonte do sistema aumenta.
 */
export function MonthlyChart({ months, masked = false }: MonthlyChartProps) {
  const peak = Math.max(...months.map((month) => month.totalCents), 1);
  const last = months.at(-1);

  return (
    <div className="flex items-end gap-2" role="img" aria-label={describe(months)}>
      {months.map((month) => (
        <div key={month.month} className="flex flex-1 flex-col items-center gap-1.5">
          <span className="valor text-num-xs text-texto-fraco">
            {masked ? "••" : shortValue(month.totalCents)}
          </span>
          <div
            className={`w-full rounded-sm ${month === last ? "bg-saida-fill" : "bg-saida-fill/45"}`}
            style={{ height: `${Math.max((month.totalCents / peak) * 96, 2)}px` }}
          />
          <span className="text-2xs text-texto-fraco">{formatMonthLabel(month.month)}</span>
        </div>
      ))}
    </div>
  );
}

function shortValue(cents: number): string {
  if (cents === 0) return "—";
  if (cents >= 100000) return `${Math.round(cents / 100000)}k`;
  return String(Math.round(cents / 100));
}

function describe(months: readonly MonthlyTotal[]): string {
  return months
    .map((month) => `${formatMonthLabel(month.month)}: ${formatBRL(month.totalCents)}`)
    .join(", ");
}
