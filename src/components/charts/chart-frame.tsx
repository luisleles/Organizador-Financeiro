import type { ReactNode } from "react";

type ChartFrameProps = {
  /** Descrição textual do gráfico, para quem usa leitor de tela. */
  summary: string;
  isEmpty: boolean;
  emptyMessage: string;
  height?: number;
  children: ReactNode;
};

/**
 * Moldura comum: altura fixa (o `ResponsiveContainer` do Recharts precisa de um pai com
 * altura) e um estado vazio que diz o que falta, em vez de um retângulo em branco.
 */
export function ChartFrame({
  summary,
  isEmpty,
  emptyMessage,
  height = 220,
  children,
}: ChartFrameProps) {
  if (isEmpty) {
    return (
      <div
        className="border-linha text-texto-fraco flex items-center justify-center rounded-md border border-dashed px-4 text-center text-sm"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <figure className="m-0" style={{ height }} role="img" aria-label={summary}>
      {children}
    </figure>
  );
}
