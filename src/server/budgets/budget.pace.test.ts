import { describe, expect, it } from "vitest";
import {
  buildBudgetProgress,
  budgetStatus,
  daysInMonth,
  monthAdherence,
  monthProgress,
  pacedLimitCents,
} from "./budget.pace";

const AGOSTO = { year: 2026, month: 8, day: 1 };
const at = (isoDate: string) => new Date(`${isoDate}T15:00:00Z`);

describe("daysInMonth", () => {
  it("conhece meses curtos e fevereiro", () => {
    expect(daysInMonth({ year: 2026, month: 8, day: 1 })).toBe(31);
    expect(daysInMonth({ year: 2026, month: 4, day: 1 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 2, day: 1 })).toBe(28);
  });
});

describe("monthProgress", () => {
  it("conta o dia corrente inteiro", () => {
    expect(monthProgress(at("2026-08-01"), AGOSTO)).toBeCloseTo(1 / 31);
  });

  it("chega a 1 no último dia", () => {
    expect(monthProgress(at("2026-08-31"), AGOSTO)).toBe(1);
  });

  it("é 1 para mês já passado e 0 para mês futuro", () => {
    expect(monthProgress(at("2026-09-05"), AGOSTO)).toBe(1);
    expect(monthProgress(at("2026-07-20"), AGOSTO)).toBe(0);
  });

  it("usa o calendário de São Paulo para saber que dia é hoje", () => {
    // 01/09 às 00:30 UTC ainda é 31/08 em São Paulo.
    expect(monthProgress(new Date("2026-09-01T00:30:00Z"), AGOSTO)).toBe(1);
  });
});

describe("pacedLimitCents", () => {
  it("é a fatia do limite proporcional ao mês decorrido", () => {
    expect(pacedLimitCents(300000, 10 / 30)).toBe(100000);
  });

  it("é zero no começo e o limite inteiro no fim", () => {
    expect(pacedLimitCents(300000, 0)).toBe(0);
    expect(pacedLimitCents(300000, 1)).toBe(300000);
  });
});

describe("budgetStatus", () => {
  it("é dentro quando o gasto está abaixo do ritmo", () => {
    expect(budgetStatus(50000, 300000, 100000)).toBe("dentro");
  });

  it("é atenção quando passa do ritmo mas ainda cabe no limite", () => {
    expect(budgetStatus(180000, 300000, 100000)).toBe("atencao");
  });

  it("é estourado quando passa do limite", () => {
    expect(budgetStatus(310000, 300000, 100000)).toBe("estourado");
  });

  it("estourado vence atenção", () => {
    expect(budgetStatus(400000, 300000, 300000)).toBe("estourado");
  });

  it("gastar exatamente o ritmo ainda é estar dentro", () => {
    expect(budgetStatus(100000, 300000, 100000)).toBe("dentro");
  });
});

describe("buildBudgetProgress", () => {
  it("no dia 10 de 30 com 60% gasto, aponta o desvio do ritmo", () => {
    const progress = buildBudgetProgress(180000, 300000, 10 / 30);

    expect(progress.usedPercent).toBeCloseTo(60);
    expect(progress.pacePercent).toBeCloseTo(33.33, 1);
    expect(progress.status).toBe("atencao");
    expect(progress.aheadOfPaceCents).toBe(80000);
    expect(progress.remainingCents).toBe(120000);
  });

  it("não aponta desvio quando o gasto está em dia", () => {
    const progress = buildBudgetProgress(90000, 300000, 10 / 30);

    expect(progress.status).toBe("dentro");
    expect(progress.aheadOfPaceCents).toBe(0);
  });

  it("mostra restante negativo quando estoura", () => {
    const progress = buildBudgetProgress(340000, 300000, 1);

    expect(progress.status).toBe("estourado");
    expect(progress.remainingCents).toBe(-40000);
    expect(progress.usedPercent).toBeCloseTo(113.33, 1);
  });

  it("trata limite zero como estourado assim que se gasta qualquer coisa", () => {
    expect(buildBudgetProgress(100, 0, 0.5).status).toBe("estourado");
    expect(buildBudgetProgress(0, 0, 0.5).status).toBe("dentro");
  });
});

describe("monthAdherence", () => {
  it("marca mês sem orçamento definido", () => {
    const adherence = monthAdherence("2026-07", null, 50000);

    expect(adherence.usedPercent).toBeNull();
    expect(adherence.status).toBeNull();
  });

  it("mês fechado não tem atenção: ou coube, ou estourou", () => {
    expect(monthAdherence("2026-07", 100000, 99000).status).toBe("dentro");
    expect(monthAdherence("2026-07", 100000, 100001).status).toBe("estourado");
  });

  it("calcula o percentual usado", () => {
    expect(monthAdherence("2026-07", 200000, 150000).usedPercent).toBe(75);
  });
});
