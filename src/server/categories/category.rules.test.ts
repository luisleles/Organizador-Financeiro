import { describe, expect, it } from "vitest";
import {
  findMatchingRule,
  normalizeForMatch,
  orderRules,
  resolveCategoryId,
  ruleMatches,
  type MatchableRule,
} from "./category.rules";

const rule = (overrides: Partial<MatchableRule> & Pick<MatchableRule, "id" | "pattern">) =>
  ({ categoryId: `cat-${overrides.id}`, priority: 0, active: true, ...overrides }) as MatchableRule;

describe("normalizeForMatch", () => {
  it("tira acento e caixa", () => {
    expect(normalizeForMatch("Pão de Açúcar")).toBe("pao de acucar");
  });

  it("apara espaço nas pontas", () => {
    expect(normalizeForMatch("  Uber  ")).toBe("uber");
  });
});

describe("ruleMatches", () => {
  it("casa ignorando acento e caixa dos dois lados", () => {
    expect(ruleMatches("SUPERMERCADO PÃO DE ACUCAR", "pao de açucar")).toBe(true);
  });

  it("casa em qualquer posição da descrição", () => {
    expect(ruleMatches("Pagamento Uber *trip", "uber")).toBe(true);
  });

  it("não casa o que não está lá", () => {
    expect(ruleMatches("Padaria", "uber")).toBe(false);
  });

  it("nunca casa com padrão vazio, que pegaria tudo", () => {
    expect(ruleMatches("qualquer coisa", "")).toBe(false);
    expect(ruleMatches("qualquer coisa", "   ")).toBe(false);
  });
});

describe("orderRules", () => {
  it("avalia prioridade menor primeiro", () => {
    const ordered = orderRules([
      rule({ id: "b", pattern: "x", priority: 5 }),
      rule({ id: "a", pattern: "x", priority: 1 }),
    ]);

    expect(ordered.map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("empatou na prioridade, o padrão mais longo ganha por ser mais específico", () => {
    const ordered = orderRules([
      rule({ id: "curto", pattern: "uber" }),
      rule({ id: "longo", pattern: "uber eats" }),
    ]);

    expect(ordered.map((r) => r.id)).toEqual(["longo", "curto"]);
  });
});

describe("findMatchingRule", () => {
  const rules = [
    rule({ id: "uber", pattern: "uber", categoryId: "transporte" }),
    rule({ id: "ubereats", pattern: "uber eats", categoryId: "alimentacao" }),
    rule({ id: "off", pattern: "padaria", categoryId: "alimentacao", active: false }),
  ];

  it("escolhe a regra mais específica quando as duas casam", () => {
    expect(findMatchingRule("UBER EATS pedido 12", rules)?.categoryId).toBe("alimentacao");
  });

  it("cai na regra genérica quando só ela casa", () => {
    expect(findMatchingRule("Uber viagem centro", rules)?.categoryId).toBe("transporte");
  });

  it("ignora regra desligada", () => {
    expect(findMatchingRule("Padaria do bairro", rules)).toBeNull();
  });

  it("devolve nulo quando nada casa", () => {
    expect(findMatchingRule("Cinema", rules)).toBeNull();
  });

  it("devolve nulo sem regra nenhuma", () => {
    expect(findMatchingRule("Uber", [])).toBeNull();
  });
});

describe("resolveCategoryId", () => {
  const rules = [rule({ id: "uber", pattern: "uber", categoryId: "transporte" })];

  it("preenche o que ficou em branco", () => {
    expect(resolveCategoryId("Uber viagem", null, rules)).toBe("transporte");
  });

  it("respeita a escolha explícita do usuário, mesmo contrariando a regra", () => {
    expect(resolveCategoryId("Uber viagem", "lazer", rules)).toBe("lazer");
  });

  it("continua sem categoria quando nada casa", () => {
    expect(resolveCategoryId("Cinema", null, rules)).toBeNull();
  });
});
