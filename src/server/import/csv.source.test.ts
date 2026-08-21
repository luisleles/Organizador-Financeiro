import { describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import { detectDelimiter, parseAmountCents, parseDateParts, parseDelimited } from "./csv.parse";
import { CsvSource } from "./csv.source";

const PARAMS = { accountId: "conta1", since: new Date("2000-01-01T00:00:00.000Z") };

describe("parseDelimited", () => {
  it("separa colunas e linhas", () => {
    expect(parseDelimited("a;b\n1;2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("mantém o separador que está dentro de aspas", () => {
    expect(parseDelimited('data;historico\n01/08;"Mercado; centro"')).toEqual([
      ["data", "historico"],
      ["01/08", "Mercado; centro"],
    ]);
  });

  it("entende aspas escapadas em dobro", () => {
    expect(parseDelimited('a\n"diz ""oi"""')).toEqual([["a"], ['diz "oi"']]);
  });

  it("aceita CRLF e ignora linha vazia no fim", () => {
    expect(parseDelimited("a;b\r\n1;2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("descarta o BOM que o Excel escreve", () => {
    expect(parseDelimited("﻿data;valor")).toEqual([["data", "valor"]]);
  });
});

describe("detectDelimiter", () => {
  it("acha o ponto e vírgula do padrão brasileiro", () => {
    expect(detectDelimiter("data;descricao;valor\n01/08/2026;Mercado;-10,00")).toBe(";");
  });

  it("acha a vírgula do padrão americano", () => {
    expect(detectDelimiter("date,description,amount")).toBe(",");
  });

  it("não confunde vírgula decimal dentro de aspas com separador", () => {
    expect(detectDelimiter('data;valor\n01/08;"1.234,56"')).toBe(";");
  });
});

describe("parseAmountCents", () => {
  it.each([
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["-45,90", -4590],
    ["45,90-", -4590],
    ["(45,90)", -4590],
    ["R$ 10,00", 1000],
    ["10", 1000],
    ["0,01", 1],
  ])("lê %s como %i centavos", (entrada, esperado) => {
    expect(parseAmountCents(entrada)).toBe(esperado);
  });

  it("devolve nulo para texto que não é número", () => {
    expect(parseAmountCents("")).toBeNull();
    expect(parseAmountCents("saldo")).toBeNull();
  });
});

describe("parseDateParts", () => {
  it("lê o formato brasileiro", () => {
    expect(parseDateParts("15/08/2026", "DD/MM/AAAA")).toEqual({ year: 2026, month: 8, day: 15 });
  });

  it("lê o formato ISO", () => {
    expect(parseDateParts("2026-08-15", "AAAA-MM-DD")).toEqual({ year: 2026, month: 8, day: 15 });
  });

  it("lê o formato americano", () => {
    expect(parseDateParts("08/15/2026", "MM/DD/AAAA")).toEqual({ year: 2026, month: 8, day: 15 });
  });

  it("recusa mês impossível", () => {
    expect(parseDateParts("15/13/2026", "DD/MM/AAAA")).toBeNull();
  });
});

describe("CsvSource", () => {
  const extrato = [
    "Data;Historico;Valor",
    "15/08/2026;Mercado do bairro;-125,90",
    "16/08/2026;Salário;7.200,00",
  ].join("\n");

  const source = new CsvSource({
    text: extrato,
    mapping: { date: 0, description: 1, amount: 2 },
    dateFormat: "DD/MM/AAAA",
  });

  it("se identifica como fonte csv", () => {
    expect(source.id).toBe("csv");
  });

  it("lê data, descrição e valor com sinal", async () => {
    const lidas = await source.fetchTransactions(PARAMS);

    expect(lidas).toHaveLength(2);
    expect(formatDate(lidas[0].date)).toBe("15/08/2026");
    expect(lidas[0].description).toBe("Mercado do bairro");
    expect(lidas[0].amountCents).toBe(-12590);
    expect(lidas[1].amountCents).toBe(720000);
  });

  it("guarda a linha original no rawPayload", async () => {
    const [primeira] = await source.fetchTransactions(PARAMS);
    expect(primeira.rawPayload).toEqual(["15/08/2026", "Mercado do bairro", "-125,90"]);
  });

  it("gera a mesma identidade nas duas leituras do mesmo arquivo", async () => {
    const primeira = await source.fetchTransactions(PARAMS);
    const segunda = await new CsvSource({
      text: extrato,
      mapping: { date: 0, description: 1, amount: 2 },
      dateFormat: "DD/MM/AAAA",
    }).fetchTransactions(PARAMS);

    expect(segunda.map((row) => row.externalId)).toEqual(primeira.map((row) => row.externalId));
  });

  it("não colapsa duas compras iguais no mesmo dia", async () => {
    const repetido = new CsvSource({
      text: ["Data;Historico;Valor", "15/08/2026;Café;-7,00", "15/08/2026;Café;-7,00"].join("\n"),
      mapping: { date: 0, description: 1, amount: 2 },
      dateFormat: "DD/MM/AAAA",
    });

    const lidas = await repetido.fetchTransactions(PARAMS);
    expect(lidas).toHaveLength(2);
    expect(lidas[0].externalId).not.toBe(lidas[1].externalId);
  });

  it("usa o identificador do arquivo quando ele existe", async () => {
    const comId = new CsvSource({
      text: ["Id;Data;Historico;Valor", "TX-1;15/08/2026;Mercado;-10,00"].join("\n"),
      mapping: { externalId: 0, date: 1, description: 2, amount: 3 },
      dateFormat: "DD/MM/AAAA",
    });

    const [primeira] = await comId.fetchTransactions(PARAMS);
    expect(primeira.externalId).toBe("TX-1");
  });

  it("junta colunas separadas de crédito e débito", async () => {
    const duasColunas = new CsvSource({
      text: [
        "Data;Historico;Entrada;Saida",
        "15/08/2026;Salário;7.200,00;",
        "16/08/2026;Aluguel;;1.800,00",
      ].join("\n"),
      mapping: { date: 0, description: 1, amount: -1, credit: 2, debit: 3 },
      dateFormat: "DD/MM/AAAA",
    });

    const lidas = await duasColunas.fetchTransactions(PARAMS);
    expect(lidas.map((row) => row.amountCents)).toEqual([720000, -180000]);
  });

  it("pula linha sem data, sem valor ou sem descrição", async () => {
    const sujo = new CsvSource({
      text: [
        "Data;Historico;Valor",
        "15/08/2026;Mercado;-10,00",
        ";Sem data;-10,00",
        "16/08/2026;;-10,00",
        "17/08/2026;Sem valor;",
        "SALDO ANTERIOR",
      ].join("\n"),
      mapping: { date: 0, description: 1, amount: 2 },
      dateFormat: "DD/MM/AAAA",
    });

    expect(await sujo.fetchTransactions(PARAMS)).toHaveLength(1);
  });

  it("respeita o corte de data pedido", async () => {
    const lidas = await source.fetchTransactions({
      accountId: "conta1",
      since: new Date("2026-08-16T00:00:00.000Z"),
    });

    expect(lidas.map((row) => row.description)).toEqual(["Salário"]);
  });
});
