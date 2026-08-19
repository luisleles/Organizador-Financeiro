import { describe, expect, it } from "vitest";
import {
  accountBalanceCents,
  buildBalanceSeries,
  calculateBalanceCents,
  consolidateBalances,
  openingBalanceCents,
  sumMovementCents,
} from "./account.balance";

const REAIS = 100;

describe("calculateBalanceCents", () => {
  it("devolve o saldo inicial quando a conta não tem movimento", () => {
    expect(calculateBalanceCents(3200 * REAIS, [])).toBe(320000);
  });

  it("soma entradas e subtrai saídas a partir do saldo inicial", () => {
    const balance = calculateBalanceCents(3200 * REAIS, [
      { amountCents: 540000 },
      { amountCents: -180000 },
      { amountCents: -48990 },
    ]);

    expect(balance).toBe(320000 + 540000 - 180000 - 48990);
  });

  it("aceita saldo negativo, como o de um cartão de crédito com fatura aberta", () => {
    const balance = calculateBalanceCents(0, [{ amountCents: -25000 }, { amountCents: -13050 }]);

    expect(balance).toBe(-38050);
  });

  it("não perde centavos em somas longas, porque tudo é inteiro", () => {
    const entries = Array.from({ length: 1000 }, () => ({ amountCents: -1 }));

    expect(calculateBalanceCents(1000, entries)).toBe(0);
  });
});

describe("sumMovementCents", () => {
  it("é zero para lista vazia", () => {
    expect(sumMovementCents([])).toBe(0);
  });
});

describe("consolidateBalances", () => {
  it("separa ativo de passivo e devolve o líquido", () => {
    const totals = consolidateBalances([320000, 500000, -38050]);

    expect(totals).toEqual({
      totalCents: 781950,
      assetsCents: 820000,
      liabilitiesCents: 38050,
    });
  });

  it("trata uma carteira zerada como nem ativo nem passivo", () => {
    expect(consolidateBalances([0])).toEqual({
      totalCents: 0,
      assetsCents: 0,
      liabilitiesCents: 0,
    });
  });
});

describe("transferência entre contas próprias", () => {
  const CHECKING_INITIAL = 320000;
  const SAVINGS_INITIAL = 500000;
  const TRANSFER_CENTS = 120000;

  /** As duas pernas da transferência, como o banco as guarda: sinais opostos, mesmo módulo. */
  const outgoingLeg = { amountCents: -TRANSFER_CENTS };
  const incomingLeg = { amountCents: TRANSFER_CENTS };

  it("debita a conta de origem e credita a de destino", () => {
    expect(calculateBalanceCents(CHECKING_INITIAL, [outgoingLeg])).toBe(200000);
    expect(calculateBalanceCents(SAVINGS_INITIAL, [incomingLeg])).toBe(620000);
  });

  it("não muda o total consolidado", () => {
    const before = consolidateBalances([
      calculateBalanceCents(CHECKING_INITIAL, []),
      calculateBalanceCents(SAVINGS_INITIAL, []),
    ]);

    const after = consolidateBalances([
      calculateBalanceCents(CHECKING_INITIAL, [outgoingLeg]),
      calculateBalanceCents(SAVINGS_INITIAL, [incomingLeg]),
    ]);

    expect(after.totalCents).toBe(before.totalCents);
    expect(after.totalCents).toBe(820000);
  });

  it("também não muda o total quando a origem fica negativa", () => {
    const emptyWallet = 0;

    const after = consolidateBalances([
      calculateBalanceCents(emptyWallet, [outgoingLeg]),
      calculateBalanceCents(SAVINGS_INITIAL, [incomingLeg]),
    ]);

    expect(after.totalCents).toBe(SAVINGS_INITIAL);
    expect(after.assetsCents).toBe(620000);
    expect(after.liabilitiesCents).toBe(120000);
  });
});

describe("buildBalanceSeries", () => {
  const day = (dayOfMonth: number) => new Date(Date.UTC(2026, 7, dayOfMonth, 15));

  it("acumula o saldo entrada por entrada", () => {
    const series = buildBalanceSeries(100000, [
      { date: day(1), amountCents: 50000 },
      { date: day(3), amountCents: -20000 },
      { date: day(7), amountCents: -5000 },
    ]);

    expect(series.map((point) => point.balanceCents)).toEqual([150000, 130000, 125000]);
    expect(series.map((point) => point.date)).toEqual([day(1), day(3), day(7)]);
  });

  it("devolve lista vazia quando não há movimento", () => {
    expect(buildBalanceSeries(100000, [])).toEqual([]);
  });

  it("termina exatamente no saldo atual quando parte do saldo de abertura calculado", () => {
    const currentBalance = 125000;
    const entries = [
      { date: day(1), amountCents: 50000 },
      { date: day(3), amountCents: -20000 },
      { date: day(7), amountCents: -5000 },
    ];

    const series = buildBalanceSeries(openingBalanceCents(currentBalance, entries), entries);

    expect(series.at(-1)?.balanceCents).toBe(currentBalance);
  });
});

describe("accountBalanceCents", () => {
  it("combina saldo inicial com o total já somado no banco", () => {
    expect(accountBalanceCents(320000, -120000)).toBe(200000);
  });
});
