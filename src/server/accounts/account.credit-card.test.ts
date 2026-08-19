import { describe, expect, it } from "vitest";
import { calculateBalanceCents, consolidateBalances } from "./account.balance";
import {
  LIMIT_ALERT_PERCENT,
  creditCardCycle,
  creditCardPosition,
  isLimitAlert,
} from "./account.credit-card";

const CREDIT_LIMIT = 1_000_000; // R$ 10.000,00
const DEBT = -120_000; // R$ 1.200,00 em aberto
const CHECKING = 500_000; // R$ 5.000,00

describe("creditCardPosition", () => {
  it("separa fatura, limite disponível e uso do limite", () => {
    const position = creditCardPosition(DEBT, CREDIT_LIMIT);

    expect(position.currentDebtCents).toBe(-120000);
    expect(position.availableLimitCents).toBe(880000);
    expect(position.limitUsagePercent).toBe(12);
    expect(position.creditBalanceCents).toBe(0);
  });

  it("cartão sem uso tem o limite inteiro disponível", () => {
    const position = creditCardPosition(0, CREDIT_LIMIT);

    expect(position.currentDebtCents).toBe(0);
    expect(position.availableLimitCents).toBe(CREDIT_LIMIT);
    expect(position.limitUsagePercent).toBe(0);
  });

  it("mantém a fatura em zero quando o cartão foi pago a mais, e guarda o crédito à parte", () => {
    const position = creditCardPosition(44518, CREDIT_LIMIT);

    expect(position.currentDebtCents).toBe(0);
    expect(position.creditBalanceCents).toBe(44518);
    expect(position.availableLimitCents).toBe(CREDIT_LIMIT);
  });

  it("aceita limite estourado, devolvendo disponível negativo", () => {
    const position = creditCardPosition(-1_100_000, CREDIT_LIMIT);

    expect(position.availableLimitCents).toBe(-100000);
    expect(position.limitUsagePercent).toBe(110);
  });

  it("não divide por zero quando não há limite cadastrado", () => {
    expect(creditCardPosition(-5000, 0).limitUsagePercent).toBe(0);
  });
});

describe("isLimitAlert", () => {
  it("alerta apenas acima do limiar", () => {
    expect(isLimitAlert(LIMIT_ALERT_PERCENT)).toBe(false);
    expect(isLimitAlert(LIMIT_ALERT_PERCENT + 0.1)).toBe(true);
    expect(isLimitAlert(12)).toBe(false);
  });
});

describe("saldo consolidado com cartão de crédito", () => {
  it("soma todas as contas com o cartão entrando pela dívida", () => {
    const totals = consolidateBalances([
      { balanceCents: CHECKING, isCreditCard: false },
      { balanceCents: DEBT, isCreditCard: true },
    ]);

    expect(totals.accountsBalanceCents).toBe(500000);
    expect(totals.openInvoicesCents).toBe(120000);
    expect(totals.netCents).toBe(380000); // R$ 3.800,00
  });

  it("não soma o limite disponível ao consolidado", () => {
    const position = creditCardPosition(DEBT, CREDIT_LIMIT);
    const totals = consolidateBalances([
      { balanceCents: CHECKING, isCreditCard: false },
      { balanceCents: DEBT, isCreditCard: true },
    ]);

    expect(position.availableLimitCents).toBe(880000);
    expect(totals.netCents).toBe(380000);
    expect(totals.netCents).not.toBe(CHECKING + position.availableLimitCents);
  });

  it("dobrar o limite do cartão não muda um centavo do consolidado", () => {
    const totals = (limitCents: number) => {
      creditCardPosition(DEBT, limitCents);
      return consolidateBalances([
        { balanceCents: CHECKING, isCreditCard: false },
        { balanceCents: DEBT, isCreditCard: true },
      ]).netCents;
    };

    expect(totals(CREDIT_LIMIT)).toBe(totals(CREDIT_LIMIT * 2));
  });
});

describe("pagamento de fatura por transferência", () => {
  /**
   * Pagar a fatura move dinheiro da conta para o cartão: o ativo cai e a dívida cai no
   * mesmo valor. O saldo líquido, portanto, **não muda** — quem muda é a composição.
   * O que este teste protege é o erro caro: contabilizar o pagamento como despesa nova,
   * o que derrubaria o líquido duas vezes.
   */
  const payment = 120_000;
  const outgoingLeg = { amountCents: -payment };
  const incomingLeg = { amountCents: payment };

  const before = consolidateBalances([
    { balanceCents: CHECKING, isCreditCard: false },
    { balanceCents: DEBT, isCreditCard: true },
  ]);

  const after = consolidateBalances([
    { balanceCents: calculateBalanceCents(CHECKING, [outgoingLeg]), isCreditCard: false },
    { balanceCents: calculateBalanceCents(DEBT, [incomingLeg]), isCreditCard: true },
  ]);

  it("zera a fatura em aberto", () => {
    expect(before.openInvoicesCents).toBe(120000);
    expect(after.openInvoicesCents).toBe(0);
  });

  it("reduz o saldo em contas exatamente no valor pago, sem despesa extra", () => {
    expect(after.accountsBalanceCents).toBe(before.accountsBalanceCents - payment);
    expect(after.accountsBalanceCents).toBe(380000);
  });

  it("mantém o saldo líquido, porque ativo e dívida caíram no mesmo valor", () => {
    expect(after.netCents).toBe(before.netCents);
    expect(after.netCents).toBe(380000);
  });

  it("devolve o limite ao cartão", () => {
    const paidCard = calculateBalanceCents(DEBT, [incomingLeg]);
    const position = creditCardPosition(paidCard, CREDIT_LIMIT);

    expect(position.currentDebtCents).toBe(0);
    expect(position.availableLimitCents).toBe(CREDIT_LIMIT);
    expect(position.limitUsagePercent).toBe(0);
  });
});

describe("creditCardCycle", () => {
  const at = (isoDate: string) => new Date(`${isoDate}T15:00:00Z`);

  it("fecha ainda neste mês quando o dia de fechamento não passou", () => {
    const cycle = creditCardCycle(20, 28, at("2026-08-12"));

    expect(cycle.closingDate.toISOString()).toBe("2026-08-20T03:00:00.000Z");
    expect(cycle.dueDate.toISOString()).toBe("2026-08-28T03:00:00.000Z");
    expect(cycle.daysUntilClosing).toBe(8);
  });

  it("pula para o mês seguinte quando o fechamento já passou", () => {
    const cycle = creditCardCycle(20, 28, at("2026-08-25"));

    expect(cycle.closingDate.toISOString()).toBe("2026-09-20T03:00:00.000Z");
    expect(cycle.daysUntilClosing).toBe(26);
  });

  it("vence no mês seguinte ao fechamento quando o dia de vencimento é menor", () => {
    const cycle = creditCardCycle(28, 5, at("2026-08-10"));

    expect(cycle.closingDate.toISOString()).toBe("2026-08-28T03:00:00.000Z");
    expect(cycle.dueDate.toISOString()).toBe("2026-09-05T03:00:00.000Z");
  });

  it("encaixa o dia 31 em mês curto", () => {
    const cycle = creditCardCycle(31, 10, at("2026-02-05"));

    expect(cycle.closingDate.toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(cycle.daysUntilClosing).toBe(23);
  });

  it("devolve zero dias quando fecha hoje", () => {
    expect(creditCardCycle(20, 28, at("2026-08-20")).daysUntilClosing).toBe(0);
  });
});
