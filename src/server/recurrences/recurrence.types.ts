import type { RecurringFrequency, TransactionType } from "@prisma/client";
import type { ProjectionDay } from "./recurrence.projection";

export type RecurringRuleRow = {
  id: string;
  description: string;
  amountCents: number;
  type: TransactionType;
  accountId: string;
  accountName: string;
  isCreditCard: boolean;
  categoryId: string | null;
  categoryName: string | null;
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth: number | null;
  startDate: Date;
  endDate: Date | null;
  active: boolean;
  lastRunAt: Date | null;
  /** Próxima data prevista, já respeitando término e pausa. */
  nextOccurrenceAt: Date | null;
};

export type UpcomingOccurrence = {
  ruleId: string;
  date: Date;
  /** `AAAA-MM-DD`, que é como as ações identificam a ocorrência. */
  dateKey: string;
  description: string;
  /** Valor já com o ajuste daquele dia aplicado, quando existe. */
  amountCents: number;
  type: TransactionType;
  accountName: string;
  isCreditCard: boolean;
  categoryName: string | null;
  skipped: boolean;
  /** Verdadeiro quando o valor daquele dia foi editado e destoa da regra. */
  edited: boolean;
};

export type BalanceProjection = {
  openingCents: number;
  days: ProjectionDay[];
  firstNegative: ProjectionDay | null;
  lowest: ProjectionDay | null;
};

export type MaterializationResult = {
  createdCount: number;
};
