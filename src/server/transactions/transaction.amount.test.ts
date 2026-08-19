import { describe, expect, it } from "vitest";
import { AmountExpressionError, evaluateAmountExpression } from "./transaction.amount";

describe("evaluateAmountExpression", () => {
  it("lê um valor em BRL com milhar e centavos", () => {
    expect(evaluateAmountExpression("1.234,56")).toBe(123456);
  });

  it("aceita o símbolo da moeda e espaços que a pessoa digita sem pensar", () => {
    expect(evaluateAmountExpression(" R$ 1.234,56 ")).toBe(123456);
  });

  it("soma uma expressão simples", () => {
    expect(evaluateAmountExpression("12,50+8")).toBe(2050);
  });

  it("subtrai", () => {
    expect(evaluateAmountExpression("100-12,50")).toBe(8750);
  });

  it("encadeia somas e subtrações da esquerda para a direita", () => {
    expect(evaluateAmountExpression("10+20-5+1,50")).toBe(2650);
  });

  it("multiplica dando o mesmo resultado independente da ordem dos fatores", () => {
    expect(evaluateAmountExpression("3*12,50")).toBe(3750);
    expect(evaluateAmountExpression("12,50*3")).toBe(3750);
  });

  it("resolve multiplicação antes de soma", () => {
    expect(evaluateAmountExpression("10+2*3")).toBe(1600);
  });

  it("aceita sinal negativo no começo", () => {
    expect(evaluateAmountExpression("-12,50")).toBe(-1250);
  });

  it("arredonda para o centavo em vez de acumular fração", () => {
    expect(evaluateAmountExpression("0,01*3")).toBe(3);
    expect(evaluateAmountExpression("10,01*3")).toBe(3003);
    expect(evaluateAmountExpression("33,33*3")).toBe(9999);
  });

  it("recusa entrada vazia", () => {
    expect(() => evaluateAmountExpression("")).toThrow(AmountExpressionError);
    expect(() => evaluateAmountExpression("   ")).toThrow(AmountExpressionError);
  });

  it("recusa operador solto", () => {
    expect(() => evaluateAmountExpression("12+")).toThrow(AmountExpressionError);
    expect(() => evaluateAmountExpression("12++3")).toThrow(AmountExpressionError);
    expect(() => evaluateAmountExpression("*3")).toThrow(AmountExpressionError);
  });

  it("recusa texto que não é conta", () => {
    expect(() => evaluateAmountExpression("doze reais")).toThrow(AmountExpressionError);
    expect(() => evaluateAmountExpression("12/3")).toThrow(AmountExpressionError);
  });
});
