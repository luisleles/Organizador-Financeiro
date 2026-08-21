import { describe, expect, it } from "vitest";
import { buildPreview } from "./import.pipeline";
import type { RawTransaction } from "./source";

const REGRAS = [
  { id: "r1", pattern: "mercado", categoryId: "cat-mercado", priority: 1, active: true },
  { id: "r2", pattern: "salário", categoryId: "cat-salario", priority: 2, active: true },
  { id: "r3", pattern: "posto", categoryId: "cat-combustivel", priority: 3, active: false },
];

const CATEGORIAS = new Map([
  ["cat-mercado", "Supermercado"],
  ["cat-salario", "Salário CLT"],
  ["cat-combustivel", "Combustível"],
]);

function bruta(overrides: Partial<RawTransaction> = {}): RawTransaction {
  return {
    externalId: "tx-1",
    date: new Date("2026-08-15T12:00:00.000Z"),
    description: "Mercado do bairro",
    amountCents: -12590,
    rawPayload: null,
    ...overrides,
  };
}

function preview(transactions: RawTransaction[], existentes: string[] = []) {
  return buildPreview({
    transactions,
    existingExternalIds: new Set(existentes),
    rules: REGRAS,
    categoryNameById: CATEGORIAS,
  });
}

describe("buildPreview", () => {
  it("normaliza a data para AAAA-MM-DD e deriva o tipo pelo sinal", () => {
    const { rows } = preview([bruta(), bruta({ externalId: "tx-2", amountCents: 720000 })]);

    expect(rows[0].date).toBe("2026-08-15");
    expect(rows[0].type).toBe("EXPENSE");
    expect(rows[1].type).toBe("INCOME");
  });

  it("marca como duplicado o que já existe no banco", () => {
    const { rows, totals } = preview([bruta()], ["tx-1"]);

    expect(rows[0].status).toBe("duplicado");
    expect(totals.novos).toBe(0);
    expect(totals.duplicados).toBe(1);
  });

  it("marca a segunda aparição da mesma chave dentro do arquivo", () => {
    const { rows } = preview([bruta(), bruta()]);

    expect(rows.map((row) => row.status)).toEqual(["novo", "repetido-no-arquivo"]);
  });

  it("aplica a regra de categorização que casa com a descrição", () => {
    const { rows } = preview([bruta()]);

    expect(rows[0].categoryId).toBe("cat-mercado");
    expect(rows[0].categoryName).toBe("Supermercado");
    expect(rows[0].categorySuggested).toBe(true);
  });

  it("ignora regra desligada", () => {
    const { rows } = preview([bruta({ description: "Posto Ipiranga" })]);
    expect(rows[0].categoryId).toBeNull();
  });

  it("conta quantos novos ainda estão sem categoria", () => {
    const { totals } = preview([
      bruta(),
      bruta({ externalId: "tx-2", description: "Compra qualquer" }),
      bruta({ externalId: "tx-3", description: "Outra compra" }),
    ]);

    expect(totals.novos).toBe(3);
    expect(totals.semCategoria).toBe(2);
  });

  it("soma só o que é novo no total em centavos", () => {
    const { totals } = preview(
      [bruta(), bruta({ externalId: "tx-2", amountCents: -1000 })],
      ["tx-1"],
    );

    expect(totals.novosCents).toBe(-1000);
  });

  it("preserva o payload cru para depuração", () => {
    const { rows } = preview([bruta({ rawPayload: { FITID: "abc" } })]);
    expect(rows[0].rawPayload).toEqual({ FITID: "abc" });
  });

  it("aguenta arquivo vazio", () => {
    const { rows, totals } = preview([]);

    expect(rows).toEqual([]);
    expect(totals).toMatchObject({ total: 0, novos: 0, duplicados: 0 });
  });
});
