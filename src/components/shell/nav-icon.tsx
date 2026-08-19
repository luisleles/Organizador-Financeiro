import type { ReactNode } from "react";
import type { NavIconName } from "@/lib/navigation";

const PATHS: Record<NavIconName, ReactNode> = {
  inicio: <path d="M3 10h14M6 10V6M10 10v4M14 10V4" />,
  transacoes: <path d="M3 7h11l-3-3M17 13H6l3 3" />,
  contas: <path d="M3 6h14v9H3zM3 9h14" />,
  orcamentos: <path d="M3 5h14M3 10h9M3 15h5" />,
  metas: <path d="M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM10 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />,
  categorias: <path d="M4 4h6l6 6-6 6-6-6zM7 7h.01" />,
  relatorios: <path d="M3 16V9M8 16V4M13 16v-5M18 16v-8" />,
  configuracoes: <path d="M3 6h14M3 13h14M8 4v4M13 11v4" />,
};

type NavIconProps = {
  name: NavIconName;
  className?: string;
};

export function NavIcon({ name, className }: NavIconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
