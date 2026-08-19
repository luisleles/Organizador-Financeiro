import type { BalancePoint } from "@/server/accounts/account.balance";

const VIEWBOX_WIDTH = 100;
const VIEWBOX_HEIGHT = 32;

type BalanceSparklineProps = {
  points: readonly BalancePoint[];
  className?: string;
};

/**
 * Evolução do saldo no recorte carregado. O eixo é esticado sem manter proporção, então a
 * linha usa `non-scaling-stroke` para não engordar horizontalmente.
 */
export function BalanceSparkline({ points, className }: BalanceSparklineProps) {
  if (points.length < 2) return null;

  const values = points.map((point) => point.balanceCents);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const toX = (index: number) => (index / (points.length - 1)) * VIEWBOX_WIDTH;
  const toY = (cents: number) => VIEWBOX_HEIGHT - ((cents - min) / range) * VIEWBOX_HEIGHT;

  const line = values.map((cents, index) => `${toX(index)},${toY(cents)}`).join(" ");
  const area = `${toX(0)},${toY(min)} ${line} ${toX(values.length - 1)},${toY(min)}`;
  const isNegative = (values.at(-1) ?? 0) < 0;

  return (
    <svg
      role="img"
      aria-label="Evolução do saldo no período carregado"
      viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
      preserveAspectRatio="none"
      className={isNegative ? `text-alerta ${className ?? ""}` : `text-entrada ${className ?? ""}`}
    >
      <polygon points={area} fill="currentColor" opacity="0.12" />
      {min < 0 && max > 0 && (
        <line
          x1="0"
          x2={VIEWBOX_WIDTH}
          y1={toY(0)}
          y2={toY(0)}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 2"
          opacity="0.35"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <polyline
        points={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
