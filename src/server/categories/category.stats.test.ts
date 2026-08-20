import { describe, expect, it } from "vitest";
import { buildMonthlyTotals, comparePeriods, formatMonthLabel, monthKey } from "./category.stats";

const at = (isoDate: string) => new Date(`${isoDate}T15:00:00Z`);

describe("buildMonthlyTotals", () => {
  const reference = at("2026-08-19");

  it("devolve um ponto por mês, do mais antigo para o mais recente", () => {
    const totals = buildMonthlyTotals([], 3, reference);

    expect(totals.map((point) => point.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("mantém mês sem lançamento com zero, em vez de sumir do gráfico", () => {
    const totals = buildMonthlyTotals(
      [{ date: at("2026-08-10"), amountCents: -5000 }],
      3,
      reference,
    );

    expect(totals.map((point) => point.totalCents)).toEqual([0, 0, 5000]);
  });

  it("soma em módulo, porque é volume gasto e não saldo", () => {
    const totals = buildMonthlyTotals(
      [
        { date: at("2026-08-10"), amountCents: -5000 },
        { date: at("2026-08-12"), amountCents: -2500 },
      ],
      1,
      reference,
    );

    expect(totals[0].totalCents).toBe(7500);
  });

  it("descarta lançamento fora da janela pedida", () => {
    const totals = buildMonthlyTotals(
      [{ date: at("2025-01-10"), amountCents: -9999 }],
      3,
      reference,
    );

    expect(totals.every((point) => point.totalCents === 0)).toBe(true);
  });

  it("usa o calendário de São Paulo para decidir o mês", () => {
    // 01/09 às 00:30 UTC ainda é 31/08 em São Paulo.
    const totals = buildMonthlyTotals(
      [{ date: new Date("2026-09-01T00:30:00Z"), amountCents: -1000 }],
      2,
      reference,
    );

    expect(totals).toEqual([
      { month: "2026-07", totalCents: 0 },
      { month: "2026-08", totalCents: 1000 },
    ]);
  });
});

describe("comparePeriods", () => {
  it("calcula diferença e variação percentual", () => {
    expect(comparePeriods(120000, 100000)).toEqual({
      currentCents: 120000,
      previousCents: 100000,
      deltaCents: 20000,
      deltaPercent: 20,
    });
  });

  it("aceita queda", () => {
    expect(comparePeriods(80000, 100000).deltaPercent).toBe(-20);
  });

  it("não inventa percentual quando o mês anterior foi zero", () => {
    expect(comparePeriods(50000, 0).deltaPercent).toBeNull();
  });

  it("arredonda para uma casa decimal", () => {
    expect(comparePeriods(100333, 100000).deltaPercent).toBe(0.3);
  });
});

describe("formatMonthLabel", () => {
  it("encurta para mês e ano", () => {
    expect(formatMonthLabel("2026-08")).toBe("ago/26");
  });
});

describe("monthKey", () => {
  it("preenche o mês com zero à esquerda", () => {
    expect(monthKey({ year: 2026, month: 3, day: 9 })).toBe("2026-03");
  });
});
