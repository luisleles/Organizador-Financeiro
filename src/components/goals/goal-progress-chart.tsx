"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_PROPS, CHART_COLORS } from "@/components/charts/chart-theme";
import { ChartFrame } from "@/components/charts/chart-frame";
import { MoneyTooltip } from "@/components/charts/money-tooltip";
import { formatBRL } from "@/lib/money";
import { formatMonthLabel } from "@/server/categories/category.stats";
import type { GoalSeriesPoint } from "@/server/goals/goal.projection";

type GoalProgressChartProps = {
  series: readonly GoalSeriesPoint[];
  targetCents: number;
  /** Mês do prazo, no formato `AAAA-MM`. */
  deadlineMonth: string;
  late: boolean;
};

/**
 * O acumulado real em linha cheia e a projeção pelo ritmo recente em tracejado. O alvo é
 * uma linha horizontal e o prazo uma vertical: **o ponto onde a projeção cruza o alvo é a
 * data real de conclusão**, e ver esse cruzamento cair depois da linha do prazo diz o
 * atraso sem precisar ler número nenhum.
 */
export function GoalProgressChart({
  series,
  targetCents,
  deadlineMonth,
  late,
}: GoalProgressChartProps) {
  const data = series.map((point) => ({
    mes: formatMonthLabel(point.month),
    chave: point.month,
    real: point.realCents,
    projecao: point.projectedCents,
  }));

  const deadlineLabel = data.find((point) => point.chave === deadlineMonth)?.mes;

  // Meta parada é uma linha reta no zero com o eixo repetindo "0": não há curva para ler,
  // e o estado vazio diz mais do que o gráfico.
  const stalled = data.every((point) => !point.real && !point.projecao);

  return (
    <ChartFrame
      summary={`Acumulado da meta: ${data
        .filter((point) => point.real !== null)
        .map((point) => `${point.mes} ${formatBRL(point.real ?? 0)}`)
        .join(", ")}. Alvo ${formatBRL(targetCents)}.`}
      isEmpty={data.length < 2 || stalled}
      emptyMessage="Registre o primeiro aporte para a curva começar a aparecer."
      height={200}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`metaFill-${deadlineMonth}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.receita} stopOpacity={0.3} />
              <stop offset="100%" stopColor={CHART_COLORS.receita} stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={CHART_COLORS.grade} vertical={false} />
          <XAxis dataKey="mes" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} width={50} tickFormatter={(value: number) => compact(value)} />

          <ReferenceLine
            y={targetCents}
            stroke={CHART_COLORS.linha}
            strokeDasharray="5 4"
            label={{
              value: "alvo",
              position: "insideTopLeft",
              fill: "var(--color-texto-fraco)",
              fontSize: 11,
            }}
          />
          {deadlineLabel && (
            <ReferenceLine
              x={deadlineLabel}
              stroke={late ? "var(--color-alerta)" : "var(--color-texto-fraco)"}
              strokeDasharray="3 3"
              label={{
                value: "prazo",
                position: "top",
                fill: late ? "var(--color-alerta)" : "var(--color-texto-fraco)",
                fontSize: 11,
              }}
            />
          )}

          <Tooltip
            cursor={{ stroke: CHART_COLORS.grade }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload;

              return (
                <MoneyTooltip
                  title={String(label)}
                  rows={
                    point.real !== null
                      ? [
                          {
                            label: "Guardado",
                            valueCents: Number(point.real),
                            color: CHART_COLORS.receita,
                          },
                        ]
                      : [
                          {
                            label: "Projetado",
                            valueCents: Number(point.projecao ?? 0),
                            color: "var(--color-previsto)",
                          },
                        ]
                  }
                  footer={point.real === null ? "Estimativa pelo ritmo de 3 meses." : undefined}
                />
              );
            }}
          />

          <Area
            isAnimationActive={false}
            type="monotone"
            dataKey="real"
            stroke={CHART_COLORS.receita}
            strokeWidth={2}
            fill={`url(#metaFill-${deadlineMonth})`}
            dot={false}
            connectNulls={false}
          />
          <Line
            isAnimationActive={false}
            type="monotone"
            dataKey="projecao"
            stroke="var(--color-previsto)"
            strokeWidth={2}
            strokeDasharray="5 4"
            dot={false}
            connectNulls
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
