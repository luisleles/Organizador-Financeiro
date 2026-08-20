"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

type CashFlowChartProps = {
  months: readonly MonthlyCashFlow[];
  height?: number;
};

/**
 * Barras divergindo do zero: receita para cima, despesa para baixo, no mesmo mês.
 *
 * Não usam `stackId` de propósito. Empilhar de verdade somaria as duas séries, e a soma de
 * receita com despesa é o saldo — um número que já está na linha e que, como barra,
 * esconderia exatamente os dois valores que o gráfico existe para mostrar. Receita e
 * despesa não são partes de um todo; são fluxos opostos, e é assim que aparecem.
 *
 * A linha de saldo usa o **mesmo eixo** das barras, porque é a mesma grandeza em reais.
 * Um segundo eixo y aqui seria a forma mais fácil de mentir com este gráfico.
 */
export function CashFlowChart({ months, height = 300 }: CashFlowChartProps) {
  const data = months.map((month) => ({
    mes: formatMonthLabel(month.month),
    receita: month.incomeCents,
    // Negativa no gráfico, positiva no tooltip: a barra desce, o número lido é o volume.
    despesa: -month.expenseCents,
    despesaCents: month.expenseCents,
    saldo: month.netCents,
  }));

  const isEmpty = data.every((item) => item.receita === 0 && item.despesaCents === 0);

  return (
    <ChartFrame
      summary={`Fluxo de caixa mensal: ${data
        .map(
          (item) =>
            `${item.mes} receita ${formatBRL(item.receita)}, despesa ${formatBRL(item.despesaCents)}`,
        )
        .join("; ")}`}
      isEmpty={isEmpty}
      emptyMessage="Nenhum lançamento nos meses analisados."
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke={CHART_COLORS.grade} vertical={false} />
          <XAxis dataKey="mes" {...AXIS_PROPS} />
          <YAxis {...AXIS_PROPS} width={54} tickFormatter={(value: number) => compact(value)} />
          <Tooltip
            cursor={{ fill: "var(--color-fundo)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <MoneyTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: "Receita",
                      valueCents: Number(payload[0]?.payload.receita ?? 0),
                      color: CHART_COLORS.receita,
                    },
                    {
                      label: "Despesa",
                      valueCents: Number(payload[0]?.payload.despesaCents ?? 0),
                      color: CHART_COLORS.despesa,
                    },
                    {
                      label: "Saldo",
                      valueCents: Number(payload[0]?.payload.saldo ?? 0),
                      color: CHART_COLORS.linha,
                    },
                  ]}
                  footer="Transferências entre contas próprias ficam de fora."
                />
              ) : null
            }
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "var(--color-texto-fraco)" }}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.grade} />
          <Bar
            isAnimationActive={false}
            dataKey="receita"
            name="Receita"
            fill={CHART_COLORS.receita}
            radius={[4, 4, 0, 0]}
            maxBarSize={30}
          />
          <Bar
            isAnimationActive={false}
            dataKey="despesa"
            name="Despesa"
            fill={CHART_COLORS.despesa}
            radius={[0, 0, 4, 4]}
            maxBarSize={30}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="saldo"
            name="Saldo"
            stroke={CHART_COLORS.linha}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: CHART_COLORS.linha }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: CHART_COLORS.superficie }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function compact(cents: number): string {
  const reais = cents / 100;
  if (Math.abs(reais) >= 1000) return `${Math.round(reais / 1000)}k`;
  return String(Math.round(reais));
}
