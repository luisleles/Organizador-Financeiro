import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-linha-forte flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <EmptyMark />
      <h3 className="font-display text-texto text-xl">{title}</h3>
      <p className="text-texto-fraco max-w-sm text-sm">{description}</p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

/** A silhueta de um mês sem nada lançado, no vocabulário do Batimento. */
const GHOST_INCOME = [0, 5, 0, 0, 8, 0, 0, 4, 0, 0, 7, 0, 0, 3, 0, 0];
const GHOST_EXPENSE = [4, 7, 3, 9, 5, 6, 10, 4, 8, 3, 7, 5, 9, 4, 6, 8];

function EmptyMark() {
  return (
    <svg aria-hidden viewBox="0 0 132 44" className="text-previsto h-11 w-33">
      {GHOST_INCOME.map((height, index) =>
        height === 0 ? null : (
          <line
            key={`entrada-${index}`}
            x1={6 + index * 8}
            x2={6 + index * 8}
            y1={22}
            y2={22 - height}
            stroke="currentColor"
            strokeWidth="4"
            opacity="0.4"
          />
        ),
      )}
      {GHOST_EXPENSE.map((height, index) => (
        <line
          key={`saida-${index}`}
          x1={6 + index * 8}
          x2={6 + index * 8}
          y1={22}
          y2={22 + height}
          stroke="currentColor"
          strokeWidth="4"
          opacity="0.4"
        />
      ))}
      <line x1="0" y1="22" x2="132" y2="22" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
