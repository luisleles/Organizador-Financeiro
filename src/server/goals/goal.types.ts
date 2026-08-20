import type { BucketComposition } from "@/server/accounts/account.buckets";
import type { GoalPace, GoalSeriesPoint } from "./goal.projection";

export type GoalMovementRow = {
  id: string;
  date: Date;
  description: string;
  amountCents: number;
  kind: "aporte" | "resgate" | "rendimento";
};

export type GoalBucket = {
  accountId: string;
  name: string;
  parentAccountId: string;
  parentAccountName: string;
  archived: boolean;
} & BucketComposition;

export type GoalDetail = {
  id: string;
  name: string;
  color: string;
  icon: string;
  targetCents: number;
  targetDate: Date;
  archived: boolean;
  expectedYearlyRatePercent: number | null;
  /** `null` enquanto a meta está só no planejamento, sem caixinha. */
  bucket: GoalBucket | null;
  pace: GoalPace;
  series: GoalSeriesPoint[];
  movements: GoalMovementRow[];
};

export type GoalListing = {
  planning: GoalDetail[];
  active: GoalDetail[];
  completed: GoalDetail[];
  archived: GoalDetail[];
};
