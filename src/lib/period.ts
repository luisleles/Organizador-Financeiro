import {
  addMonths,
  endOfMonthInZone,
  formatDate,
  fromZonedParts,
  startOfMonthInZone,
  toDateParts,
  type DateParts,
} from "./date";

export const PERIOD_PARAM = "periodo";
export const FROM_PARAM = "de";
export const TO_PARAM = "ate";

export const PERIOD_PRESETS = [
  "mes-atual",
  "mes-anterior",
  "ultimos-3-meses",
  "ano",
  "personalizado",
] as const;

export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  "mes-atual": "Mês atual",
  "mes-anterior": "Mês anterior",
  "ultimos-3-meses": "Últimos 3 meses",
  ano: "Ano",
  personalizado: "Personalizado",
};

export type Period =
  | { preset: Exclude<PeriodPreset, "personalizado"> }
  | { preset: "personalizado"; from: string; to: string };

export type ResolvedPeriod = {
  start: Date;
  end: Date;
  label: string;
};

export const DEFAULT_PERIOD: Period = { preset: "mes-atual" };

/** Só o que o `URLSearchParams` do navegador e o do Next têm em comum. */
type ReadableParams = {
  get: (name: string) => string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  month: "long",
  year: "numeric",
});

const SHORT_MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  month: "short",
});

function isPreset(value: string | null): value is PeriodPreset {
  return PERIOD_PRESETS.includes(value as PeriodPreset);
}

function toParts(isoDate: string): DateParts {
  const [year, month, day] = isoDate.split("-").map(Number);
  return { year, month, day };
}

export function toISODate(instant: Date): string {
  const { year, month, day } = toDateParts(instant);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Parâmetro ausente ou corrompido cai no padrão em vez de quebrar a página. */
export function parsePeriod(params: ReadableParams): Period {
  const preset = params.get(PERIOD_PARAM);
  if (!isPreset(preset)) return DEFAULT_PERIOD;

  if (preset !== "personalizado") return { preset };

  const from = params.get(FROM_PARAM);
  const to = params.get(TO_PARAM);
  if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) return DEFAULT_PERIOD;

  return from <= to ? { preset, from, to } : { preset, from: to, to: from };
}

export function writePeriod(params: URLSearchParams, period: Period): URLSearchParams {
  params.set(PERIOD_PARAM, period.preset);

  if (period.preset === "personalizado") {
    params.set(FROM_PARAM, period.from);
    params.set(TO_PARAM, period.to);
  } else {
    params.delete(FROM_PARAM);
    params.delete(TO_PARAM);
  }

  return params;
}

/** Query só com o período, para os links de navegação carregarem o recorte sem arrastar o resto. */
export function periodQuery(period: Period): string {
  return `?${writePeriod(new URLSearchParams(), period)}`;
}

export function resolvePeriod(period: Period, now: Date = new Date()): ResolvedPeriod {
  const today = toDateParts(now);

  switch (period.preset) {
    case "mes-atual":
      return monthRange(today);

    case "mes-anterior":
      return monthRange(addMonths(today, -1));

    case "ultimos-3-meses": {
      const first = addMonths(today, -2);
      return {
        start: startOfMonthInZone(first),
        end: endOfMonthInZone(today),
        label: `${shortMonth(first)} – ${shortMonth(today)} de ${today.year}`,
      };
    }

    case "ano":
      return {
        start: startOfMonthInZone({ year: today.year, month: 1, day: 1 }),
        end: endOfMonthInZone({ year: today.year, month: 12, day: 1 }),
        label: String(today.year),
      };

    case "personalizado": {
      const start = fromZonedParts(toParts(period.from));
      const end = fromZonedParts(toParts(period.to), true);
      return { start, end, label: `${formatDate(start)} – ${formatDate(end)}` };
    }
  }
}

function monthRange(parts: DateParts): ResolvedPeriod {
  const start = startOfMonthInZone(parts);
  return {
    start,
    end: endOfMonthInZone(parts),
    label: MONTH_YEAR_FORMATTER.format(start),
  };
}

function shortMonth(parts: DateParts): string {
  return SHORT_MONTH_FORMATTER.format(startOfMonthInZone(parts)).replace(".", "");
}
