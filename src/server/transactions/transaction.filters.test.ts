import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  countActiveFilters,
  groupByDay,
  parseFilters,
  summarizeEntries,
  writeFilters,
} from "./transaction.filters";

const params = (query: string) => new URLSearchParams(query);

describe("parseFilters", () => {
  it("cai no padrão sem nenhum parâmetro", () => {
    expect(parseFilters(params(""))).toEqual(DEFAULT_FILTERS);
  });

  it("lê listas repetidas de conta, categoria e etiqueta", () => {
    const filters = parseFilters(params("conta=a&conta=b&categoria=c&tag=d&tag=e"));

    expect(filters.accountIds).toEqual(["a", "b"]);
    expect(filters.categoryIds).toEqual(["c"]);
    expect(filters.tagIds).toEqual(["d", "e"]);
  });

  it("descarta repetição e valor vazio na mesma lista", () => {
    expect(parseFilters(params("conta=a&conta=a&conta=")).accountIds).toEqual(["a"]);
  });

  it("ignora tipo, ordem e direção que não existem", () => {
    const filters = parseFilters(params("tipo=BANANA&ordem=cor&dir=meio"));

    expect(filters.type).toBeNull();
    expect(filters.sort).toBe("data");
    expect(filters.direction).toBe("desc");
  });

  it("lê a faixa de valor em reais e guarda em centavos", () => {
    const filters = parseFilters(params("min=12,50&max=1.234,56"));

    expect(filters.minCents).toBe(1250);
    expect(filters.maxCents).toBe(123456);
  });

  it("inverte a faixa de valor quando vem trocada", () => {
    const filters = parseFilters(params("min=500&max=10"));

    expect(filters.minCents).toBe(1000);
    expect(filters.maxCents).toBe(50000);
  });

  it("recusa faixa negativa ou sem número", () => {
    expect(parseFilters(params("min=-100")).minCents).toBeNull();
    expect(parseFilters(params("min=abc")).minCents).toBeNull();
  });

  it("volta para a página 1 quando o número não faz sentido", () => {
    expect(parseFilters(params("pagina=0")).page).toBe(1);
    expect(parseFilters(params("pagina=abc")).page).toBe(1);
    expect(parseFilters(params("pagina=3")).page).toBe(3);
  });

  it("apara espaço na busca", () => {
    expect(parseFilters(params("q=%20mercado%20")).search).toBe("mercado");
  });
});

describe("writeFilters", () => {
  it("é o inverso de parseFilters", () => {
    const original = parseFilters(
      params(
        "conta=a&conta=b&categoria=c&tag=d&tipo=EXPENSE&min=1000&max=5000&q=uber&ordem=valor&dir=asc&pagina=2",
      ),
    );

    expect(parseFilters(writeFilters(new URLSearchParams(), original))).toEqual(original);
  });

  it("omite o que está no padrão, para não sujar a URL", () => {
    const query = writeFilters(new URLSearchParams(), DEFAULT_FILTERS).toString();

    expect(query).toBe("");
  });

  it("preserva parâmetros de fora, como o período", () => {
    const existing = params("periodo=ano&outro=1");
    const query = writeFilters(existing, { ...DEFAULT_FILTERS, search: "uber" });

    expect(query.get("periodo")).toBe("ano");
    expect(query.get("outro")).toBe("1");
    expect(query.get("q")).toBe("uber");
  });

  it("limpa filtros antigos antes de escrever os novos", () => {
    const existing = params("conta=a&q=velho&pagina=4");
    const query = writeFilters(existing, DEFAULT_FILTERS);

    expect(query.toString()).toBe("");
  });
});

describe("countActiveFilters", () => {
  it("não conta ordenação nem página", () => {
    const filters = { ...DEFAULT_FILTERS, sort: "valor" as const, page: 3 };

    expect(countActiveFilters(filters)).toBe(0);
  });

  it("conta cada seleção de lista separadamente", () => {
    const filters = {
      ...DEFAULT_FILTERS,
      accountIds: ["a", "b"],
      tagIds: ["c"],
      type: "EXPENSE" as const,
      search: "uber",
    };

    expect(countActiveFilters(filters)).toBe(5);
  });
});

describe("summarizeEntries", () => {
  it("separa receita de despesa", () => {
    const summary = summarizeEntries([
      { amountCents: 500000, type: "INCOME" },
      { amountCents: -18790, type: "EXPENSE" },
      { amountCents: -9900, type: "EXPENSE" },
    ]);

    expect(summary).toEqual({
      incomeCents: 500000,
      expenseCents: 28690,
      netCents: 471310,
      transferCents: 0,
    });
  });

  it("mantém transferência fora de receita e de despesa", () => {
    const summary = summarizeEntries([
      { amountCents: -120000, type: "TRANSFER" },
      { amountCents: 120000, type: "TRANSFER" },
    ]);

    expect(summary.incomeCents).toBe(0);
    expect(summary.expenseCents).toBe(0);
    expect(summary.netCents).toBe(0);
  });

  it("conta o valor movimentado uma vez só, e não uma por perna", () => {
    const summary = summarizeEntries([
      { amountCents: -120000, type: "TRANSFER" },
      { amountCents: 120000, type: "TRANSFER" },
    ]);

    expect(summary.transferCents).toBe(120000);
  });

  it("é tudo zero para lista vazia", () => {
    expect(summarizeEntries([])).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      transferCents: 0,
    });
  });
});

describe("groupByDay", () => {
  const at = (isoDate: string, amountCents: number) => ({
    date: new Date(`${isoDate}T15:00:00Z`),
    amountCents,
  });

  it("agrupa pelo dia em São Paulo e soma o subtotal", () => {
    const groups = groupByDay([
      at("2026-08-18", -18790),
      at("2026-08-18", -2450),
      at("2026-08-17", 240000),
    ]);

    expect(groups.map((group) => group.key)).toEqual(["2026-08-18", "2026-08-17"]);
    expect(groups[0].totalCents).toBe(-21240);
    expect(groups[1].totalCents).toBe(240000);
  });

  it("respeita o fuso: 23h de São Paulo ainda é o mesmo dia", () => {
    const groups = groupByDay([
      { date: new Date("2026-08-19T02:30:00Z"), amountCents: -100 },
      { date: new Date("2026-08-18T15:00:00Z"), amountCents: -200 },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-08-18");
  });

  it("preserva a ordem recebida", () => {
    const groups = groupByDay([at("2026-08-10", -1), at("2026-08-20", -2)]);

    expect(groups.map((group) => group.key)).toEqual(["2026-08-10", "2026-08-20"]);
  });

  it("devolve lista vazia sem lançamentos", () => {
    expect(groupByDay([])).toEqual([]);
  });
});
