import { describe, expect, it } from "vitest";
import { validateOperation } from "./account.operations";

const CARD = {
  id: "cartao",
  type: "CREDIT_CARD",
  class: "LIABILITY",
  parentAccountId: null,
} as const;
const CHECKING = {
  id: "corrente",
  type: "CHECKING",
  class: "ASSET",
  parentAccountId: null,
} as const;
const BUCKET = {
  id: "caixinha",
  type: "SAVINGS_BUCKET",
  class: "ASSET",
  parentAccountId: "corrente",
} as const;

describe("validateOperation", () => {
  it("rejeita receita em cartão", () => {
    expect(validateOperation(CARD, "INCOME", 5000)).toBe("INCOME_ON_CREDIT_CARD");
  });

  it("aceita despesa em cartão", () => {
    expect(validateOperation(CARD, "EXPENSE", -5000)).toBeNull();
  });

  it("aceita estorno em cartão", () => {
    expect(validateOperation(CARD, "REFUND", 5000)).toBeNull();
  });

  it("rejeita estorno fora de cartão", () => {
    expect(validateOperation(CHECKING, "REFUND", 5000)).toBe("REFUND_REQUIRES_CREDIT_CARD");
  });

  it("rejeita transferência avulsa com cartão, sem o contexto de pagamento de fatura", () => {
    expect(validateOperation(CARD, "TRANSFER", 5000)).toBe("TRANSFER_ON_CREDIT_CARD");
  });

  it("permite a transferência do cartão só no contexto de pagamento de fatura", () => {
    expect(validateOperation(CARD, "TRANSFER", 5000, "PAY_INVOICE")).toBeNull();
  });

  it("mantém a regra da Fase 9 para caixinha: despesa avulsa é rejeitada", () => {
    expect(validateOperation(BUCKET, "EXPENSE", -1000)).toBe("LOOSE_ENTRY_IN_BUCKET");
  });

  it("mantém a regra da Fase 9 para caixinha: transferência é permitida", () => {
    expect(validateOperation(BUCKET, "TRANSFER", 1000)).toBeNull();
  });

  it("conta comum aceita receita, despesa e transferência normalmente", () => {
    expect(validateOperation(CHECKING, "INCOME", 1000)).toBeNull();
    expect(validateOperation(CHECKING, "EXPENSE", -1000)).toBeNull();
    expect(validateOperation(CHECKING, "TRANSFER", 1000)).toBeNull();
  });
});
