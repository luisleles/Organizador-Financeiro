import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  "piggy-bank": (
    <path d="M4 11a5 5 0 0 1 5-5h3a5 5 0 0 1 0 10H9a5 5 0 0 1-5-5zM6 16v2M14 16v2M14 9h.01" />
  ),
  plane: <path d="M3 11l14-6-4 14-3-5-5-2z" />,
  home: <path d="M3 9l7-5 7 5v8H3zM8 17v-5h4v5" />,
  heart: <path d="M10 16S3 12 3 7.5A3.5 3.5 0 0 1 10 6a3.5 3.5 0 0 1 7 1.5C17 12 10 16 10 16z" />,
  chart: <path d="M3 16V9M8 16V4M13 16v-5M18 16v-8" />,
  wallet: <path d="M3 6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM3 6v10M13 11h.01" />,
};

export function GoalIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[icon] ?? PATHS["piggy-bank"]}
    </svg>
  );
}

export function GoalMark({ color, icon }: { color: string; icon: string }) {
  return (
    <span
      className="text-tinta-avesso flex size-8 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: color }}
    >
      <GoalIcon icon={icon} className="size-4" />
    </span>
  );
}
