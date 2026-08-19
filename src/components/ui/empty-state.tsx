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

/** Um mês sem lançamento nenhum, desenhado com a linguagem do Batimento. */
function EmptyMark() {
  return (
    <svg aria-hidden viewBox="0 0 120 32" className="text-previsto h-8 w-30">
      <line x1="0" y1="16" x2="120" y2="16" stroke="currentColor" strokeWidth="1" />
      {Array.from({ length: 15 }, (_, index) => (
        <line
          key={index}
          x1={4 + index * 8}
          y1="10"
          x2={4 + index * 8}
          y2="22"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray="2 3"
          opacity="0.5"
        />
      ))}
    </svg>
  );
}
