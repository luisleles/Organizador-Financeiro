import { describe, expect, it } from "vitest";
import {
  buildBalanceEvolution,
  buildCategoryPivot,
  buildMonthlyCashFlow,
  collapseTail,
  compareToPrevious,
  heatStep,
  monthsEndingAt,
  rankCategoryTotals,
  savingsRate,
} from "./report.aggregations";

const at = (isoDate: string) => new Date(`${isoDate}T15:00:00Z`);
const reference = at("2026-08-19");

describe("monthsEndingAt", () => {
  it("termina no mês da referência e volta o resto", () => {
    expect(monthsEndingAt(3, reference)).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("atravessa a virada do ano", () => {
    expect(monthsEndingAt(3, at("2026-01-10"))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("buildMonthlyCashFlow", () => {
  it("separa receita de despesa e mantém meses vazios", () => {
    const flow = buildMonthlyCashFlow(
      [
        { date: at("2026-08-05"), amountCents: 500000 },
        { date: at("2026-08-10"), amountCents: -18790 },
        { date: at("2026-07-02"), amountCents: -10000 },
      ],
      3,
      reference,
    );

    expect(flow).toEqual([
      { month: "2026-06", incomeCents: 0, expenseCents: 0, netCents: 0 },
      { month: "2026-07", incomeCents: 0, expenseCents: 10000, netCents: -10000 },
      { month: "2026-08", incomeCents: 500000, expenseCents: 18790, netCents: 481210 },
    ]);
  });

  it("guarda despesa como número positivo, porque é volume e não saldo", () => {
    const [month] = buildMonthlyCashFlow(
      [{ date: at("2026-08-01"), amountCents: -5000 }],
      1,
      reference,
    );

    expect(month.expenseCents).toBe(5000);
    expect(month.netCents).toBe(-5000);
  });

  it("descarta lançamento fora da janela", () => {
    const flow = buildMonthlyCashFlow(
      [{ date: at("2025-01-01"), amountCents: -5000 }],
      2,
      reference,
    );

    expect(flow.every((month) => month.expenseCents === 0)).toBe(true);
  });
});

describe("rankCategoryTotals", () => {
  const entry = (categoryId: string | null, name: string | null, amountCents: number) => ({
    date: at("2026-08-10"),
    amountCents,
    categoryId,
    categoryName: name,
  });

  it("soma por categoria e ordena do maior para o menor", () => {
    const totals = rankCategoryTotals([
      entry("a", "Alimentação", -10000),
      entry("b", "Transporte", -30000),
      entry("a", "Alimentação", -5000),
    ]);

    expect(totals).toEqual([
      { categoryId: "b", name: "Transporte", totalCents: 30000 },
      { categoryId: "a", name: "Alimentação", totalCents: 15000 },
    ]);
  });

  it("junta os sem categoria em uma linha nomeada", () => {
    const totals = rankCategoryTotals([entry(null, null, -1000), entry(null, null, -2000)]);

    expect(totals).toEqual([{ categoryId: null, name: "Sem categoria", totalCents: 3000 }]);
  });
});

describe("collapseTail", () => {
  const totals = Array.from({ length: 10 }, (_, index) => ({
    categoryId: String(index),
    name: `Cat ${index}`,
    totalCents: (10 - index) * 1000,
  }));

  it("não mexe quando cabe no limite", () => {
    expect(collapseTail(totals.slice(0, 3), 5)).toHaveLength(3);
  });

  it("agrupa a cauda preservando o total", () => {
    const collapsed = collapseTail(totals, 5);
    const somaOriginal = totals.reduce((total, item) => total + item.totalCents, 0);

    expect(collapsed).toHaveLength(5);
    expect(collapsed.at(-1)?.name).toBe("Outras 6");
    expect(collapsed.reduce((total, item) => total + item.totalCents, 0)).toBe(somaOriginal);
  });
});

describe("buildCategoryPivot", () => {
  const entry = (isoDate: string, categoryId: string, name: string, amountCents: number) => ({
    date: at(isoDate),
    amountCents,
    categoryId,
    categoryName: name,
  });

  it("monta uma célula por mês e categoria", () => {
    const pivot = buildCategoryPivot(
      [
        entry("2026-08-10", "a", "Alimentação", -10000),
        entry("2026-07-10", "a", "Alimentação", -6000),
        entry("2026-08-11", "b", "Transporte", -2000),
      ],
      2,
      reference,
    );

    expect(pivot.months).toEqual(["2026-07", "2026-08"]);
    expect(pivot.rows[0]).toEqual({
      categoryId: "a",
      name: "Alimentação",
      monthlyCents: [6000, 10000],
      totalCents: 16000,
    });
    expect(pivot.peakCents).toBe(10000);
  });

  it("devolve estrutura vazia sem lançamento, mas com os meses", () => {
    const pivot = buildCategoryPivot([], 3, reference);

    expect(pivot.rows).toEqual([]);
    expect(pivot.months).toHaveLength(3);
    expect(pivot.peakCents).toBe(0);
  });
});

describe("heatStep", () => {
  it("é zero para célula vazia", () => {
    expect(heatStep(0, 10000)).toBe(0);
  });

  it("é o passo máximo no pico", () => {
    expect(heatStep(10000, 10000)).toBe(5);
  });

  it("nunca some para um valor pequeno, mas existente", () => {
    expect(heatStep(1, 1000000)).toBe(1);
  });

  it("não divide por zero quando a tabela inteira está zerada", () => {
    expect(heatStep(0, 0)).toBe(0);
  });
});

describe("savingsRate", () => {
  it("calcula quanto da receita sobrou", () => {
    expect(savingsRate(500000, 400000)).toBe(20);
  });

  it("aceita taxa negativa quando se gasta mais do que entra", () => {
    expect(savingsRate(100000, 150000)).toBe(-50);
  });

  it("não inventa taxa sem receita", () => {
    expect(savingsRate(0, 50000)).toBeNull();
  });
});

describe("buildBalanceEvolution", () => {
  it("acumula o saldo mês a mês a partir da abertura", () => {
    const series = buildBalanceEvolution(100000, [
      { month: "2026-06", deltaCents: 50000 },
      { month: "2026-07", deltaCents: -20000 },
      { month: "2026-08", deltaCents: 10000 },
    ]);

    expect(series.map((point) => point.balanceCents)).toEqual([150000, 130000, 140000]);
  });

  it("devolve lista vazia sem meses", () => {
    expect(buildBalanceEvolution(100000, [])).toEqual([]);
  });
});

describe("compareToPrevious", () => {
  it("dá diferença e percentual", () => {
    expect(compareToPrevious(120000, 100000)).toEqual({
      currentCents: 120000,
      previousCents: 100000,
      deltaCents: 20000,
      percent: 20,
    });
  });

  it("não inventa percentual contra período zerado", () => {
    expect(compareToPrevious(120000, 0).percent).toBeNull();
  });
});
