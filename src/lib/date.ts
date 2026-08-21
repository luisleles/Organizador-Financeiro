const TIME_ZONE = "America/Sao_Paulo";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(date: Date): string {
  return DATE_FORMATTER.format(date);
}

export function formatDateTime(date: Date): string {
  return DATE_TIME_FORMATTER.format(date);
}

const ZONE_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  timeZoneName: "longOffset",
});

const ISO_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export type DateParts = {
  year: number;
  /** 1 a 12, e não o 0 a 11 do `Date` — só existe confusão quando os dois convivem. */
  month: number;
  day: number;
};

function zoneOffsetMs(instant: Date): number {
  const name = ZONE_OFFSET_FORMATTER.formatToParts(instant).find(
    (part) => part.type === "timeZoneName",
  )?.value;
  const match = name ? /GMT([+-])(\d{2}):(\d{2})/.exec(name) : null;
  if (!match) return 0;

  const [, sign, hours, minutes] = match;
  const total = (Number(hours) * 60 + Number(minutes)) * 60_000;
  return sign === "-" ? -total : total;
}

/** Ano, mês e dia de um instante conforme o calendário de São Paulo, não o do servidor. */
export function toDateParts(instant: Date): DateParts {
  const [year, month, day] = ISO_PARTS_FORMATTER.format(instant).split("-").map(Number);
  return { year, month, day };
}

/**
 * Instante UTC de uma hora de parede em São Paulo. A segunda passada corrige a borda de
 * fuso: o deslocamento correto é o do próprio instante, que só é conhecido depois de uma
 * primeira estimativa.
 */
export function fromZonedParts(parts: DateParts, endOfDay = false): Date {
  const naive = endOfDay
    ? Date.UTC(parts.year, parts.month - 1, parts.day, 23, 59, 59, 999)
    : Date.UTC(parts.year, parts.month - 1, parts.day);

  const estimate = new Date(naive - zoneOffsetMs(new Date(naive)));
  return new Date(naive - zoneOffsetMs(estimate));
}

export function startOfMonthInZone(parts: DateParts): Date {
  return fromZonedParts({ ...parts, day: 1 });
}

export function endOfMonthInZone(parts: DateParts): Date {
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return fromZonedParts({ ...parts, day: lastDay }, true);
}

/** Converte o `AAAA-MM-DD` que vem de um `<input type="date">` no instante correspondente. */
export function fromISODate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return fromZonedParts({ year, month, day });
}

export function daysInMonth(parts: DateParts): number {
  return new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
}

/** Dia 31 num mês de 30 vira dia 30: a data existe, e é a intenção mais próxima. */
export function clampToMonth(month: DateParts, day: number): DateParts {
  return { ...month, day: Math.min(day, daysInMonth(month)) };
}

export function addDays(parts: DateParts, amount: number): DateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** Diferença em dias de calendário, sem depender de hora nem de fuso. */
export function daysBetween(from: DateParts, to: DateParts): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day);
  const toMs = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((toMs - fromMs) / 86_400_000);
}

export function isoDateKey(parts: DateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Formato que o `<input type="date">` entende, no calendário de São Paulo. */
export function toISODate(instant: Date): string {
  return isoDateKey(toDateParts(instant));
}

export function addMonths(parts: DateParts, amount: number): DateParts {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + amount, 1));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: 1,
  };
}
