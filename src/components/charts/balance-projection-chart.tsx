"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate } from "@/lib/date";
import { formatBRL } from "@/lib/money";
import type { ProjectionDay } from "@/server/recurrences/recurrence.projection";
import { AXIS_PROPS, CHART_COLORS } from "./chart-theme";
import { ChartFrame } from "./chart-frame";
import { MoneyTooltip } from "./money-tooltip";

type BalanceProjectionChartProps = {
  days: readonly ProjectionDay[];
  height?: number;
};

/**
 * Saldo previsto dia a dia. A área é cortada no zero: o que está acima é folga, o que está
 * abaixo é dívida, e as duas metades têm cores com significado oposto. Ver o vermelho
 * aparecer é a informação — não é preciso ler número nenhum para entender o problema.
 */
export function BalanceProjectionChart({ days, height = 260 }: BalanceProjectionChartProps) {
  const data = days.map((day) => ({
    dia: formatDate(day.date).slice(0, 5),
    saldo: day.balanceCents,
    // Duas séries a partir do mesmo saldo: cada uma pinta um lado do zero.
    folga: Math.max(day.balanceCents, 0),
    negativo: Math.min(day.balanceCents, 0),
    changeCents: day.changeCents,
    eventos: day.events.map((event) => `${event.label}: ${formatBRL(event.amountCents)}`),
  }));

  const negativos = days.filter((day) => day.negative);

  return (
    <ChartFrame
      summary={`Saldo previsto para os próximos ${days.length - 1} dias, começando em ${formatBRL(
        days[0]?.balanceCents ?? 0,
      )}${
        negativos.length > 0
          ? `. Fica negativo em ${negativos.length} ${negativos.length === 1 ? "dia" : "dias"}, a partir de ${formatDate(negativos[0].date)}`
          : ". Não fica negativo em nenhum dia"
      }.`}
      isEmpty={days.length === 0}
      emptyMessage="Sem contas a projetar: cadastre uma recorrência para ver a curva."
      height={height}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="projecaoFolga" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={CHART_COLORS.receita} stopOpacity={0.28} />
              <stop offset="100%" stopColor={CHART_COLORS.receita} stopOpacity={0.03} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke={CHART_COLORS.grade} vertical={false} />
          <XAxis dataKey="dia" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={40} />
          <YAxis {...AXIS_PROPS} width={54} tickFormatter={compact} />

          <Tooltip
            cursor={{ stroke: CHART_COLORS.grade }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const ponto = payload[0]?.payload as (typeof data)[number];

              return (
                <MoneyTooltip
                  title={String(label)}
                  rows={[
                    {
                      label: "Saldo previsto",
                      valueCents: ponto.saldo,
                      color: ponto.saldo < 0 ? CHART_COLORS.alerta : CHART_COLORS.receita,
                    },
                  ]}
                  footer={
                    ponto.eventos.length > 0 ? ponto.eventos.join(" · ") : "Nada previsto no dia."
                  }
                />
              );
            }}
          />

          <Area
            isAnimationActive={false}
            type="stepAfter"
            dataKey="folga"
            stroke="none"
            fill="url(#projecaoFolga)"
            baseValue={0}
          />
          <Area
            isAnimationActive={false}
            type="stepAfter"
            dataKey="negativo"
            stroke="none"
            fill={CHART_COLORS.alertaFill}
            fillOpacity={0.35}
            baseValue={0}
          />
          <Area
            isAnimationActive={false}
            type="stepAfter"
            dataKey="saldo"
            stroke={CHART_COLORS.linha}
            strokeWidth={2}
            fill="none"
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0, fill: CHART_COLORS.linha }}
          />
          <ReferenceLine y={0} stroke={CHART_COLORS.alerta} strokeDasharray="4 4" />
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
