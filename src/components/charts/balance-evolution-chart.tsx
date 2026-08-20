"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/money";
import { formatMonthLabel } from "@/server/categories/category.stats";
import type { BalancePoint } from "@/server/reports/report.aggregations";
import { AXIS_PROPS, CHART_COLORS } from "./chart-theme";
import { ChartFrame } from "./chart-frame";
import { MoneyTooltip } from "./money-tooltip";

type BalanceEvolutionChartProps = {
  points: readonly BalancePoint[];
};

export function BalanceEvolutionChart({ points }: BalanceEvolutionChartProps) {
  const data = points.map((point) => ({
    mes: formatMonthLabel(point.month),
    saldo: point.balanceCents,
  }));

  return (
    <ChartFrame
      summary={`Evolução do saldo: ${data.map((item) => `${item.mes} ${formatBRL(item.saldo)}`).join(", ")}`}
      isEmpty={data.length < 2}
      emptyMessage="Ainda não há meses suficientes para desenhar uma evolução."
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.receita} stopOpacity={0.35} />
              <stop offset="100%" stopColor={CHART_COLORS.receita} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grade} vertical={false} />
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} width={54} tickFormatter={(value: number) => compact(value)} />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.grade }}
            content={({ active, payload, label }) =>
              active && payload?.[0] ? (
                <MoneyTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: "Saldo total",
                      valueCents: Number(payload[0].value),
                      color: CHART_COLORS.receita,
                    },
                  ]}
                />
              ) : null
            }
          />
          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="saldo"
            stroke={CHART_COLORS.receita}
            strokeWidth={2}
            fill="url(#saldoFill)"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_COLORS.superficie }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Eixo em milhares: "12k" cabe no celular, "R$ 12.345,67" não. */
function compact(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) return `${Math.round(reais / 1000)}k`;
  return String(Math.round(reais));
}
