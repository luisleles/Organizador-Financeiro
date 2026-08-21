import type { RecurringFrequency } from "@prisma/client";

export const FREQUENCY_LABELS: Record<RecurringFrequency, { singular: string; every: string }> = {
  DAILY: { singular: "Diária", every: "dias" },
  WEEKLY: { singular: "Semanal", every: "semanas" },
  MONTHLY: { singular: "Mensal", every: "meses" },
  YEARLY: { singular: "Anual", every: "anos" },
};

/** "Mensal" quando o intervalo é 1, "a cada 2 meses" quando não é. */
export function frequencyLabel(frequency: RecurringFrequency, interval: number): string {
  const label = FREQUENCY_LABELS[frequency];
  return interval === 1 ? label.singular : `A cada ${interval} ${label.every}`;
}
