"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/money";
import { formatMonthLabel } from "@/server/categories/category.stats";
import type { MonthlyCashFlow } from "@/server/reports/report.aggregations";
import { AXIS_PROPS, CHART_COLORS } from "./chart-theme";
import { ChartFrame } from "./chart-frame";
import { MoneyTooltip } from "./money-tooltip";

type CategoryTrendChartProps = {
  months: readonly MonthlyCashFlow[];
  averageCents: number;
  categoryName: string;
};

/** Uma série só: sem legenda — o título já diz o que é. A média entra como referência. */
export function CategoryTrendChart({
  months,
  averageCents,
  categoryName,
}: CategoryTrendChartProps) {
  const data = months.map((month) => ({
    mes: formatMonthLabel(month.month),
    gasto: month.expenseCents,
  }));

  return (
    <ChartFrame
      summary={`${categoryName} mês a mês: ${data.map((item) => `${item.mes} ${formatBRL(item.gasto)}`).join(", ")}`}
      isEmpty={data.every((item) => item.gasto === 0)}
      emptyMessage={`Nenhum gasto em ${categoryName} nos últimos 12 meses.`}
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grade} vertical={false} />
          <XAxis dataKey="mes" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={54} tickFormatter={(value: number) => compact(value)} />
          <Tooltip
            cursor={{ fill: "var(--color-fundo)" }}
            content={({ active, payload, label }) =>
              active && payload?.[0] ? (
                <MoneyTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: categoryName,
                      valueCents: Number(payload[0].value),
                      color: CHART_COLORS.despesa,
                    },
                  ]}
                  footer={`Média do período: ${formatBRL(averageCents)}`}
                />
              ) : null
            }
          />
          {averageCents > 0 && (
            <ReferenceLine
              y={averageCents}
              stroke={CHART_COLORS.linha}
              strokeDasharray="4 4"
              strokeOpacity={0.5}
              label={{
                value: "média",
                position: "right",
                fill: "var(--color-texto-fraco)",
                fontSize: 11,
              }}
            />
          )}
          <Bar
            dataKey="gasto"
            fill={CHART_COLORS.despesa}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function compact(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) return `${Math.round(reais / 1000)}k`;
  return String(Math.round(reais));
}
