import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import {
  nextOccurrence,
  occurrenceKey,
  occurrencesBetween,
  type ScheduleRule,
} from "./recurrence.schedule";

const dia = (iso: string) => new Date(`${iso}T03:00:00.000Z`);
const datas = (lista: Date[]) => lista.map(formatDate);

function regra(overrides: Partial<ScheduleRule> = {}): ScheduleRule {
  return {
    frequency: "MONTHLY",
    interval: 1,
    dayOfMonth: null,
    startDate: dia("2026-01-10"),
    endDate: null,
    ...overrides,
  };
}

describe("occurrencesBetween", () => {
  it("repete o dia do mês da data de início", () => {
    const encontradas = occurrencesBetween(regra(), dia("2026-01-01"), dia("2026-04-30"));
    expect(datas(encontradas)).toEqual(["10/01/2026", "10/02/2026", "10/03/2026", "10/04/2026"]);
  });

  it("usa o dia do mês escolhido quando ele existe", () => {
    const encontradas = occurrencesBetween(
      regra({ dayOfMonth: 5 }),
      dia("2026-01-01"),
      dia("2026-03-31"),
    );
    expect(datas(encontradas)).toEqual(["05/01/2026", "05/02/2026", "05/03/2026"]);
  });

  it("encaixa o dia 31 no último dia dos meses curtos", () => {
    const encontradas = occurrencesBetween(
      regra({ dayOfMonth: 31, startDate: dia("2026-01-31") }),
      dia("2026-01-01"),
      dia("2026-04-30"),
    );
    expect(datas(encontradas)).toEqual(["31/01/2026", "28/02/2026", "31/03/2026", "30/04/2026"]);
  });

  it("não deixa o mês curto puxar os meses seguintes", () => {
    const encontradas = occurrencesBetween(
      regra({ dayOfMonth: 30, startDate: dia("2026-01-30") }),
      dia("2026-02-01"),
      dia("2026-03-31"),
    );
    expect(datas(encontradas)).toEqual(["28/02/2026", "30/03/2026"]);
  });

  it("conta o intervalo a partir do início, não do começo da janela", () => {
    const quinzenal = regra({ frequency: "WEEKLY", interval: 2, startDate: dia("2026-01-01") });
    const encontradas = occurrencesBetween(quinzenal, dia("2026-02-01"), dia("2026-03-01"));
    expect(datas(encontradas)).toEqual(["12/02/2026", "26/02/2026"]);
  });

  it("repete todo dia quando a frequência é diária", () => {
    const encontradas = occurrencesBetween(
      regra({ frequency: "DAILY", startDate: dia("2026-01-01") }),
      dia("2026-01-01"),
      dia("2026-01-05"),
    );
    expect(datas(encontradas)).toEqual([
      "01/01/2026",
      "02/01/2026",
      "03/01/2026",
      "04/01/2026",
      "05/01/2026",
    ]);
  });

  it("repete no mesmo dia do ano quando a frequência é anual", () => {
    const encontradas = occurrencesBetween(
      regra({ frequency: "YEARLY", startDate: dia("2026-03-08") }),
      dia("2026-01-01"),
      dia("2028-12-31"),
    );
    expect(datas(encontradas)).toEqual(["08/03/2026", "08/03/2027", "08/03/2028"]);
  });

  it("para na data de término", () => {
    const encontradas = occurrencesBetween(
      regra({ endDate: dia("2026-02-15") }),
      dia("2026-01-01"),
      dia("2026-12-31"),
    );
    expect(datas(encontradas)).toEqual(["10/01/2026", "10/02/2026"]);
  });

  it("devolve vazio quando a janela é anterior ao início", () => {
    expect(occurrencesBetween(regra(), dia("2025-01-01"), dia("2025-12-31"))).toEqual([]);
  });

  it("inclui as bordas da janela", () => {
    const encontradas = occurrencesBetween(regra(), dia("2026-01-10"), dia("2026-02-10"));
    expect(datas(encontradas)).toEqual(["10/01/2026", "10/02/2026"]);
  });
});

describe("nextOccurrence", () => {
  it("ignora o próprio dia de referência", () => {
    const proxima = nextOccurrence(regra(), dia("2026-01-10"));
    expect(proxima && formatDate(proxima)).toBe("10/02/2026");
  });

  it("devolve nulo quando a regra já terminou", () => {
    expect(nextOccurrence(regra({ endDate: dia("2026-01-10") }), dia("2026-02-01"))).toBeNull();
  });
});

describe("occurrenceKey", () => {
  it("identifica a ocorrência pela regra e pelo dia", () => {
    expect(occurrenceKey("regra1", dia("2026-01-10"))).toBe("regra1:2026-01-10");
  });

  it("não muda com a hora do instante recebido", () => {
    expect(occurrenceKey("regra1", new Date("2026-01-10T23:30:00.000Z"))).toBe(
      occurrenceKey("regra1", new Date("2026-01-10T03:00:00.000Z")),
    );
  });
});
