import { describe, expect, it } from "vitest";
import {
  decomposeBucketBalance,
  splitParentBalance,
  validateBucketEntry,
  validateBucketParent,
  validateBucketTransfer,
} from "./account.buckets";

const conta = (
  id: string,
  overrides: Partial<{ type: string; class: string; parentAccountId: string | null }> = {},
) =>
  ({
    id,
    type: "CHECKING",
    class: "ASSET",
    parentAccountId: null,
    ...overrides,
  }) as Parameters<typeof validateBucketTransfer>[0];

const caixinha = (id: string, parentAccountId: string) =>
  conta(id, { type: "SAVINGS_BUCKET", parentAccountId });

const cartao = (id: string) => conta(id, { type: "CREDIT_CARD", class: "LIABILITY" });

describe("validateBucketParent", () => {
  it("aceita caixinha sob conta de ativo", () => {
    expect(validateBucketParent({ type: "SAVINGS_BUCKET" }, conta("mae"))).toBeNull();
  });

  it("recusa caixinha sem conta mãe", () => {
    expect(validateBucketParent({ type: "SAVINGS_BUCKET" }, null)).toBe("PARENT_REQUIRED");
  });

  it("recusa conta comum com conta mãe", () => {
    expect(validateBucketParent({ type: "CHECKING" }, conta("mae"))).toBe("PARENT_NOT_ALLOWED");
  });

  it("recusa cartão como conta mãe", () => {
    expect(validateBucketParent({ type: "SAVINGS_BUCKET" }, cartao("card"))).toBe(
      "PARENT_MUST_BE_ASSET",
    );
  });

  it("recusa aninhamento de caixinha", () => {
    expect(validateBucketParent({ type: "SAVINGS_BUCKET" }, caixinha("b1", "mae"))).toBe(
      "PARENT_IS_BUCKET",
    );
  });

  it("recusa ser mãe de si mesma", () => {
    expect(validateBucketParent({ id: "b1", type: "SAVINGS_BUCKET" }, conta("b1"))).toBe(
      "SELF_PARENT",
    );
  });
});

describe("validateBucketTransfer", () => {
  it("deixa passar transferência entre contas comuns", () => {
    expect(validateBucketTransfer(conta("a"), conta("b"))).toBeNull();
  });

  it("aceita caixinha com a própria mãe, nos dois sentidos", () => {
    expect(validateBucketTransfer(conta("mae"), caixinha("b1", "mae"))).toBeNull();
    expect(validateBucketTransfer(caixinha("b1", "mae"), conta("mae"))).toBeNull();
  });

  it("recusa caixinha com conta que não é a mãe", () => {
    expect(validateBucketTransfer(caixinha("b1", "mae"), conta("outra"))).toBe(
      "BUCKET_MUST_USE_PARENT",
    );
  });

  it("recusa caixinha para caixinha", () => {
    expect(validateBucketTransfer(caixinha("b1", "mae"), caixinha("b2", "mae"))).toBe(
      "BUCKET_TO_BUCKET",
    );
  });

  it("recusa caixinha com cartão", () => {
    expect(validateBucketTransfer(caixinha("b1", "mae"), cartao("card"))).toBe(
      "BUCKET_TO_CREDIT_CARD",
    );
  });
});

describe("validateBucketEntry", () => {
  const bucket = caixinha("b1", "mae");

  it("aceita transferência", () => {
    expect(validateBucketEntry(bucket, "TRANSFER", -1000)).toBeNull();
  });

  it("aceita rendimento positivo", () => {
    expect(validateBucketEntry(bucket, "INCOME", 500)).toBeNull();
  });

  it("recusa despesa avulsa dentro da caixinha", () => {
    expect(validateBucketEntry(bucket, "EXPENSE", -1000)).toBe("LOOSE_ENTRY_IN_BUCKET");
  });

  it("recusa entrada negativa disfarçada de receita", () => {
    expect(validateBucketEntry(bucket, "INCOME", -500)).toBe("LOOSE_ENTRY_IN_BUCKET");
  });

  it("não interfere em conta comum", () => {
    expect(validateBucketEntry(conta("a"), "EXPENSE", -1000)).toBeNull();
  });
});

describe("splitParentBalance", () => {
  it("disponível mais caixinhas dá o total, sem contar duas vezes", () => {
    const split = splitParentBalance(500000, [120000, 80000]);

    expect(split.availableCents).toBe(500000);
    expect(split.bucketsCents).toBe(200000);
    expect(split.totalCents).toBe(700000);
  });

  it("sem caixinha, total é o disponível", () => {
    expect(splitParentBalance(500000, [])).toEqual({
      availableCents: 500000,
      bucketsCents: 0,
      totalCents: 500000,
    });
  });
});

describe("decomposeBucketBalance", () => {
  it("separa o que foi aportado do que rendeu", () => {
    const composition = decomposeBucketBalance(0, [
      { type: "TRANSFER", amountCents: 100000 },
      { type: "TRANSFER", amountCents: 50000 },
      { type: "INCOME", amountCents: 1240 },
    ]);

    expect(composition.balanceCents).toBe(151240);
    expect(composition.totalDepositedCents).toBe(150000);
    expect(composition.totalYieldCents).toBe(1240);
  });

  it("resgate reduz o aportado", () => {
    const composition = decomposeBucketBalance(0, [
      { type: "TRANSFER", amountCents: 100000 },
      { type: "TRANSFER", amountCents: -30000 },
    ]);

    expect(composition.totalDepositedCents).toBe(70000);
    expect(composition.balanceCents).toBe(70000);
  });

  it("saldo inicial da migração conta como aporte", () => {
    const composition = decomposeBucketBalance(380000, []);

    expect(composition.balanceCents).toBe(380000);
    expect(composition.totalDepositedCents).toBe(380000);
    expect(composition.totalYieldCents).toBe(0);
  });
});
