import type { GoalPace, GoalSeriesPoint } from "./goal.projection";

export type GoalContributionRow = {
  id: string;
  date: Date;
  amountCents: number;
  note: string | null;
};

export type GoalDetail = {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetDate: Date;
  archived: boolean;
  accountId: string | null;
  accountName: string | null;
  /** Quando ligado, o progresso é o saldo da conta e não a soma dos aportes. */
  useAccountBalance: boolean;
  pace: GoalPace;
  series: GoalSeriesPoint[];
  contributions: GoalContributionRow[];
};

export type GoalListing = {
  active: GoalDetail[];
  completed: GoalDetail[];
  archived: GoalDetail[];
};
