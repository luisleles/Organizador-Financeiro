import { describe, expect, it } from "vitest";
import {
  buildGoalPace,
  buildGoalSeries,
  buildMonthlySaved,
  monthsBetween,
  recentPace,
} from "./goal.projection";

const at = (isoDate: string) => new Date(`${isoDate}T15:00:00Z`);
const hoje = at("2026-08-19");

describe("monthsBetween", () => {
  it("conta meses atravessando o ano", () => {
    expect(monthsBetween({ year: 2026, month: 11, day: 1 }, { year: 2027, month: 2, day: 1 })).toBe(
      3,
    );
    expect(monthsBetween({ year: 2027, month: 2, day: 1 }, { year: 2026, month: 11, day: 1 })).toBe(
      -3,
    );
  });
});

describe("recentPace", () => {
  it("é a média mensal da janela de três meses", () => {
    const pace = recentPace(
      [
        { date: at("2026-08-05"), amountCents: 30000 },
        { date: at("2026-07-05"), amountCents: 30000 },
        { date: at("2026-06-05"), amountCents: 30000 },
      ],
      hoje,
    );

    expect(pace).toBe(30000);
  });

  it("divide pela janela inteira, mesmo com aporte em um mês só", () => {
    expect(recentPace([{ date: at("2026-08-05"), amountCents: 30000 }], hoje)).toBe(10000);
  });

  it("ignora aporte anterior à janela", () => {
    expect(recentPace([{ date: at("2026-01-05"), amountCents: 90000 }], hoje)).toBe(0);
  });

  it("é zero sem aporte nenhum", () => {
    expect(recentPace([], hoje)).toBe(0);
  });
});

describe("buildGoalPace", () => {
  const contribuicoesMensais = [
    { date: at("2026-08-05"), amountCents: 100000 },
    { date: at("2026-07-05"), amountCents: 100000 },
    { date: at("2026-06-05"), amountCents: 100000 },
  ];

  it("calcula quanto falta guardar por mês para bater o prazo", () => {
    const pace = buildGoalPace(300000, 900000, at("2026-12-31"), contribuicoesMensais, hoje);

    expect(pace.remainingCents).toBe(600000);
    expect(pace.monthsToDeadline).toBe(4);
    expect(pace.requiredPerMonthCents).toBe(150000);
  });

  it("projeta a conclusão pelo ritmo recente", () => {
    const pace = buildGoalPace(300000, 900000, at("2026-12-31"), contribuicoesMensais, hoje);

    expect(pace.recentPacePerMonthCents).toBe(100000);
    // Faltam 6.000 no ritmo de 1.000/mês: seis meses a partir de agosto.
    expect(pace.projectedDate?.toISOString().slice(0, 7)).toBe("2027-02");
    expect(pace.monthsLate).toBe(2);
  });

  it("aponta adiantamento quando o ritmo supera o necessário", () => {
    const pace = buildGoalPace(800000, 900000, at("2027-06-30"), contribuicoesMensais, hoje);

    expect(pace.monthsLate).toBeLessThan(0);
  });

  it("não projeta quando não há ritmo", () => {
    const pace = buildGoalPace(300000, 900000, at("2026-12-31"), [], hoje);

    expect(pace.recentPacePerMonthCents).toBe(0);
    expect(pace.projectedDate).toBeNull();
    expect(pace.monthsLate).toBeNull();
  });

  it("marca meta concluída e para de exigir aporte", () => {
    const pace = buildGoalPace(900000, 900000, at("2026-12-31"), contribuicoesMensais, hoje);

    expect(pace.completed).toBe(true);
    expect(pace.remainingCents).toBe(0);
    expect(pace.requiredPerMonthCents).toBeNull();
    expect(pace.projectedDate).toBeNull();
  });

  it("com prazo vencido, o que falta precisa sair de uma vez", () => {
    const pace = buildGoalPace(300000, 900000, at("2026-05-31"), contribuicoesMensais, hoje);

    expect(pace.deadlinePassed).toBe(true);
    expect(pace.monthsToDeadline).toBe(0);
    expect(pace.requiredPerMonthCents).toBe(600000);
  });

  it("não projeta conclusão além do horizonte", () => {
    const pace = buildGoalPace(
      100,
      100000000,
      at("2027-12-31"),
      [{ date: at("2026-08-01"), amountCents: 300 }],
      hoje,
    );

    expect(pace.projectedDate).toBeNull();
  });

  it("não divide por zero com meta de valor zero", () => {
    expect(buildGoalPace(0, 0, at("2026-12-31"), [], hoje).percent).toBe(0);
  });
});

describe("buildMonthlySaved", () => {
  it("acumula mês a mês até o mês atual", () => {
    const saved = buildMonthlySaved(
      [
        { date: at("2026-06-05"), amountCents: 100000 },
        { date: at("2026-07-05"), amountCents: 50000 },
      ],
      hoje,
    );

    expect(saved).toEqual([
      { month: "2026-06", savedCents: 100000 },
      { month: "2026-07", savedCents: 150000 },
      { month: "2026-08", savedCents: 150000 },
    ]);
  });

  it("devolve um ponto zerado quando não há aporte", () => {
    expect(buildMonthlySaved([], hoje)).toEqual([{ month: "2026-08", savedCents: 0 }]);
  });
});

describe("buildGoalSeries", () => {
  const contribuicoes = [
    { date: at("2026-07-05"), amountCents: 100000 },
    { date: at("2026-08-05"), amountCents: 100000 },
  ];
  const saved = buildMonthlySaved(contribuicoes, hoje);

  it("emenda a projeção no mês atual, para as duas linhas se encostarem", () => {
    const pace = buildGoalPace(200000, 500000, at("2027-06-30"), contribuicoes, hoje);
    const series = buildGoalSeries(saved, pace, hoje);

    const agosto = series.find((point) => point.month === "2026-08");
    expect(agosto?.realCents).toBe(200000);
    expect(agosto?.projectedCents).toBe(200000);
  });

  it("projeta até encostar no alvo, sem passar dele", () => {
    const pace = buildGoalPace(200000, 500000, at("2027-06-30"), contribuicoes, hoje);
    const series = buildGoalSeries(saved, pace, hoje);

    expect(series.at(-1)?.projectedCents).toBe(500000);
    expect(series.every((point) => (point.projectedCents ?? 0) <= 500000)).toBe(true);
  });

  it("não projeta nada quando a meta já foi batida", () => {
    const pace = buildGoalPace(500000, 500000, at("2027-06-30"), contribuicoes, hoje);
    const series = buildGoalSeries(saved, pace, hoje);

    expect(series.every((point) => point.realCents !== null)).toBe(true);
  });

  it("não projeta sem ritmo", () => {
    const pace = buildGoalPace(200000, 500000, at("2027-06-30"), [], hoje);
    const series = buildGoalSeries(saved, pace, hoje);

    expect(series).toHaveLength(saved.length);
  });
});

describe("buildGoalSeries com prazo", () => {
  const contribuicoes = [
    { date: at("2026-07-05"), amountCents: 150000 },
    { date: at("2026-08-05"), amountCents: 150000 },
  ];
  const saved = buildMonthlySaved(contribuicoes, hoje);

  it("estende o eixo até o prazo quando a projeção termina antes", () => {
    const pace = buildGoalPace(300000, 400000, at("2027-06-30"), contribuicoes, hoje);
    const series = buildGoalSeries(saved, pace, hoje, "2027-06");

    expect(series.at(-1)?.month).toBe("2027-06");
    expect(series.at(-1)?.projectedCents).toBeNull();
    expect(series.some((point) => point.projectedCents === 400000)).toBe(true);
  });

  it("não encurta a série quando a projeção passa do prazo", () => {
    const pace = buildGoalPace(300000, 900000, at("2026-10-31"), contribuicoes, hoje);
    const series = buildGoalSeries(saved, pace, hoje, "2026-10");

    expect((series.at(-1)?.month ?? "") > "2026-10").toBe(true);
  });

  it("chega até o prazo mesmo sem ritmo nenhum", () => {
    const pace = buildGoalPace(300000, 900000, at("2027-01-31"), [], hoje);
    const series = buildGoalSeries(saved, pace, hoje, "2027-01");

    expect(series.at(-1)?.month).toBe("2027-01");
  });
});
