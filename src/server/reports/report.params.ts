export const MONTH_OPTIONS = [6, 12, 24] as const;
export const REPORT_VIEWS = ["fluxo", "pivo", "categoria"] as const;

export type ReportView = (typeof REPORT_VIEWS)[number];

export function parseMonthCount(value: string | null): number {
  const parsed = Number(value);
  return MONTH_OPTIONS.includes(parsed as (typeof MONTH_OPTIONS)[number]) ? parsed : 12;
}

export function parseView(value: string | null): ReportView {
  return REPORT_VIEWS.includes(value as ReportView) ? (value as ReportView) : "pivo";
}
