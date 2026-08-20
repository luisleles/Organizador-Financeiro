"use client";

import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatBRL } from "@/lib/money";
import type { CategoryTotal } from "@/server/reports/report.aggregations";
import { AXIS_PROPS, CHART_COLORS } from "./chart-theme";
import { ChartFrame } from "./chart-frame";
import { MoneyTooltip } from "./money-tooltip";

type CategoryBarsProps = {
  categories: readonly CategoryTotal[];
  totalCents: number;
};

/**
 * Barras horizontais, e não treemap.
 *
 * O trabalho deste gráfico é **comparar magnitude** entre categorias, e comprimento sobre
 * uma linha de base comum é o que o olho compara com precisão — área, não. Some a isso:
 * o nome da categoria cabe legível à esquerda em vez de ser cortado dentro de um
 * retângulo; no celular as barras empilham e continuam legíveis, enquanto um treemap vira
 * lascas ilegíveis; e a coluna de valores alinha com o resto do app. Treemap ganharia se o
 * ponto fosse parte-do-todo com hierarquia e dezenas de itens — aqui são poucas
 * categorias e a pergunta é "onde foi mais dinheiro".
 *
 * Cor é magnitude, não identidade: um matiz só, o mesmo ocre de saída do design system.
 */
export function CategoryBars({ categories, totalCents }: CategoryBarsProps) {
  const data = categories.map((category) => ({
    name: category.name,
    valor: category.totalCents,
    share: totalCents > 0 ? category.totalCents / totalCents : 0,
  }));

  return (
    <ChartFrame
      summary={`Gastos por categoria: ${data.map((item) => `${item.name} ${formatBRL(item.valor)}`).join(", ")}`}
      isEmpty={data.length === 0}
      emptyMessage="Nenhuma despesa categorizada no período."
      height={Math.max(180, data.length * 38 + 24)}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }}>
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={132}
            {...AXIS_PROPS}
            tick={{ fill: "var(--color-texto)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--color-fundo)" }}
            content={({ active, payload }) =>
              active && payload?.[0] ? (
                <MoneyTooltip
                  title={String(payload[0].payload.name)}
                  rows={[
                    {
                      label: "Gasto",
                      valueCents: Number(payload[0].value),
                      color: CHART_COLORS.despesa,
                    },
                  ]}
                  footer={`${(payload[0].payload.share * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% das despesas do período`}
                />
              ) : null
            }
          />
          <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false}>
            {data.map((item) => (
              <Cell key={item.name} fill={CHART_COLORS.despesa} />
            ))}
            {/* Rótulo direto em cada barra: o valor exato sem depender de passar o mouse. */}
            <LabelList
              dataKey="valor"
              position="right"
              formatter={(value: unknown) => formatBRL(Number(value ?? 0))}
              fill="var(--color-texto-fraco)"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
