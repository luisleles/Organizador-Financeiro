import type { AccountType } from "@prisma/client";
import type { ReactNode } from "react";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Conta corrente",
  SAVINGS: "Poupança",
  CREDIT_CARD: "Cartão de crédito",
  INVESTMENT: "Investimento",
  CASH: "Carteira",
};

export const ACCOUNT_ICON_LABELS: Record<string, string> = {
  landmark: "Banco",
  wallet: "Carteira",
  "piggy-bank": "Poupança",
  "credit-card": "Cartão",
  chart: "Investimento",
};

const ICON_PATHS: Record<string, ReactNode> = {
  landmark: <path d="M3 8 10 4l7 4M5 8v7M10 8v7M15 8v7M3 17h14" />,
  wallet: <path d="M3 6h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3zM3 6v10M13 11h.01" />,
  "piggy-bank": (
    <path d="M4 11a5 5 0 0 1 5-5h3a5 5 0 0 1 0 10H9a5 5 0 0 1-5-5zM6 16v2M14 16v2M14 9h.01" />
  ),
  "credit-card": <path d="M3 6h14v9H3zM3 9h14M6 13h3" />,
  chart: <path d="M3 16V9M8 16V4M13 16v-5M18 16v-8" />,
};

type AccountIconProps = {
  icon: string;
  className?: string;
};

export function AccountIcon({ icon, className }: AccountIconProps) {
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
      {ICON_PATHS[icon] ?? ICON_PATHS.wallet}
    </svg>
  );
}

type AccountMarkProps = {
  color: string;
  icon: string;
};

/** Ícone dentro de um disco na cor da conta — a cor identifica, não classifica. */
export function AccountMark({ color, icon }: AccountMarkProps) {
  return (
    <span
      className="text-tinta-avesso flex size-8 shrink-0 items-center justify-center rounded-full"
      style={{ backgroundColor: color }}
    >
      <AccountIcon icon={icon} className="size-4" />
    </span>
  );
}
