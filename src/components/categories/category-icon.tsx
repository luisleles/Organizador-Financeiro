import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  tag: <path d="M4 4h6l6 6-6 6-6-6zM7 7h.01" />,
  home: <path d="M3 9l7-5 7 5v8H3zM8 17v-5h4v5" />,
  cart: <path d="M3 4h2l2 8h8l2-6H6M8 16h.01M14 16h.01" />,
  car: <path d="M3 12l1.5-4h11L17 12v4h-2v-2H5v2H3zM6 12h.01M14 12h.01" />,
  heart: <path d="M10 16S3 12 3 7.5A3.5 3.5 0 0 1 10 6a3.5 3.5 0 0 1 7 1.5C17 12 10 16 10 16z" />,
  book: (
    <path d="M4 4h5a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H4zM16 4h-5a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h5z" />
  ),
  ticket: <path d="M3 7h14v3a2 2 0 0 0 0 4v2H3v-2a2 2 0 0 0 0-4zM10 7v8" />,
  wallet: <path d="M3 6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM3 6v10M13 11h.01" />,
};

type CategoryIconProps = {
  icon: string;
  className?: string;
};

export function CategoryIcon({ icon, className }: CategoryIconProps) {
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
      {PATHS[icon] ?? PATHS.tag}
    </svg>
  );
}

type CategoryMarkProps = {
  color: string;
  icon: string;
  size?: "sm" | "md";
};

export function CategoryMark({ color, icon, size = "md" }: CategoryMarkProps) {
  return (
    <span
      className={`text-tinta-avesso flex shrink-0 items-center justify-center rounded-full ${
        size === "sm" ? "size-6" : "size-8"
      }`}
      style={{ backgroundColor: color }}
    >
      <CategoryIcon icon={icon} className={size === "sm" ? "size-3.5" : "size-4"} />
    </span>
  );
}
