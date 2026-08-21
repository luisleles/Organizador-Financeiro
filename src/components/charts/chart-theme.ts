/**
 * Os gráficos leem os mesmos tokens da interface. Como os tokens usam `light-dark()`, o
 * modo escuro troca sozinho — e com passos escolhidos para o fundo escuro, não invertidos
 * do claro. Ver `--c-grafico-*` em `globals.css`.
 */
export const CHART_COLORS = {
  receita: "var(--color-grafico-receita)",
  despesa: "var(--color-grafico-despesa)",
  linha: "var(--color-grafico-linha)",
  alerta: "var(--color-alerta)",
  alertaFill: "var(--color-alerta-fill)",
  previsto: "var(--color-previsto)",
  grade: "var(--color-grafico-grade)",
  texto: "var(--color-texto-fraco)",
  superficie: "var(--color-superficie)",
} as const;

export const HEAT_STEPS = [
  "var(--color-calor-0)",
  "var(--color-calor-1)",
  "var(--color-calor-2)",
  "var(--color-calor-3)",
  "var(--color-calor-4)",
  "var(--color-calor-5)",
] as const;

/** Eixos e grade recuados: a marca é o dado, não a moldura. */
export const AXIS_PROPS = {
  stroke: CHART_COLORS.grade,
  tick: { fill: "var(--color-texto-fraco)", fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;
