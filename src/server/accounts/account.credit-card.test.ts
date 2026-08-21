import { describe, expect, it } from "vitest";
import { calculateBalanceCents, consolidateBalances } from "./account.balance";
import {
  LIMIT_ALERT_PERCENT,
  creditCardCycle,
  creditCardPosition,
  groupByInvoice,
  invoiceCycleStatus,
  invoiceHistoryStart,
  invoicePaymentStatus,
  isLimitAlert,
  isOpenForPosting,
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

    expect(totals.assetsBalanceCents).toBe(500000);
    expect(totals.openInvoicesCents).toBe(120000);
    expect(totals.netWorthCents).toBe(380000); // R$ 3.800,00
  });

  it("não soma o limite disponível ao consolidado", () => {
    const position = creditCardPosition(DEBT, CREDIT_LIMIT);
    const totals = consolidateBalances([
      { balanceCents: CHECKING, isCreditCard: false },
      { balanceCents: DEBT, isCreditCard: true },
    ]);

    expect(position.availableLimitCents).toBe(880000);
    expect(totals.netWorthCents).toBe(380000);
    expect(totals.netWorthCents).not.toBe(CHECKING + position.availableLimitCents);
  });

  it("dobrar o limite do cartão não muda um centavo do patrimônio líquido", () => {
    const totals = (limitCents: number) => {
      creditCardPosition(DEBT, limitCents);
      return consolidateBalances([
        { balanceCents: CHECKING, isCreditCard: false },
        { balanceCents: DEBT, isCreditCard: true },
      ]).netWorthCents;
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

  it("reduz o ativo exatamente no valor pago, sem despesa extra", () => {
    expect(after.assetsBalanceCents).toBe(before.assetsBalanceCents - payment);
    expect(after.assetsBalanceCents).toBe(380000);
  });

  it("mantém o patrimônio líquido, porque ativo e dívida caíram no mesmo valor", () => {
    expect(after.netWorthCents).toBe(before.netWorthCents);
    expect(after.netWorthCents).toBe(380000);
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

describe("groupByInvoice", () => {
  const CLOSING_DAY = 20;
  const DUE_DAY = 28;
  const today = new Date("2026-08-19T15:00:00Z");

  const entry = (isoDate: string, amountCents: number) => ({
    date: new Date(`${isoDate}T15:00:00Z`),
    amountCents,
  });

  it("joga a compra depois do fechamento para a fatura seguinte", () => {
    const groups = groupByInvoice(
      [entry("2026-08-25", -10000), entry("2026-08-18", -5000)],
      CLOSING_DAY,
      DUE_DAY,
      today,
    );

    expect(groups.map((group) => group.key)).toEqual(["2026-09-20", "2026-08-20"]);
    expect(groups[0].entries).toHaveLength(1);
    expect(groups[1].entries).toHaveLength(1);
  });

  it("inclui a compra feita no próprio dia do fechamento na fatura que fecha", () => {
    const groups = groupByInvoice([entry("2026-08-20", -3000)], CLOSING_DAY, DUE_DAY, today);

    expect(groups[0].key).toBe("2026-08-20");
  });

  it("soma o total de cada fatura no sinal do extrato", () => {
    const groups = groupByInvoice(
      [entry("2026-08-18", -10000), entry("2026-08-15", -2500), entry("2026-08-10", 4000)],
      CLOSING_DAY,
      DUE_DAY,
      today,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].totalCents).toBe(-8500);
  });

  it("marca fechada, aberta e futura conforme o ciclo de hoje", () => {
    const groups = groupByInvoice(
      [entry("2026-08-25", -1000), entry("2026-08-18", -1000), entry("2026-07-10", -1000)],
      CLOSING_DAY,
      DUE_DAY,
      today,
    );

    expect(groups.map((group) => group.status)).toEqual(["futura", "aberta", "fechada"]);
  });

  it("devolve as datas de fechamento e vencimento de cada fatura", () => {
    const [group] = groupByInvoice([entry("2026-08-18", -1000)], CLOSING_DAY, DUE_DAY, today);

    expect(group.closingDate.toISOString()).toBe("2026-08-20T03:00:00.000Z");
    expect(group.dueDate.toISOString()).toBe("2026-08-28T03:00:00.000Z");
  });

  it("preserva a ordem em que os lançamentos chegaram dentro da fatura", () => {
    const [group] = groupByInvoice(
      [entry("2026-08-18", -100), entry("2026-08-15", -200), entry("2026-08-12", -300)],
      CLOSING_DAY,
      DUE_DAY,
      today,
    );

    expect(group.entries.map((e) => e.amountCents)).toEqual([-100, -200, -300]);
  });

  it("devolve lista vazia sem lançamentos", () => {
    expect(groupByInvoice([], CLOSING_DAY, DUE_DAY, today)).toEqual([]);
  });
});

describe("isOpenForPosting", () => {
  const closingDate = new Date("2026-08-20T03:00:00.000Z");

  it("aceita hoje antes do fechamento", () => {
    expect(isOpenForPosting(closingDate, new Date("2026-08-10T15:00:00Z"))).toBe(true);
  });

  it("aceita o próprio dia do fechamento", () => {
    expect(isOpenForPosting(closingDate, new Date("2026-08-20T23:00:00Z"))).toBe(true);
  });

  it("recusa um dia depois do fechamento, mesmo que a fatura nunca tenha sido paga", () => {
    expect(isOpenForPosting(closingDate, new Date("2026-08-21T15:00:00Z"))).toBe(false);
  });
});

describe("invoiceCycleStatus", () => {
  const closingDate = new Date("2026-08-20T03:00:00.000Z");

  it("é OPEN até o fechamento e CLOSED depois, sem olhar para pagamento", () => {
    expect(invoiceCycleStatus(closingDate, new Date("2026-08-20T15:00:00Z"))).toBe("OPEN");
    expect(invoiceCycleStatus(closingDate, new Date("2026-08-21T15:00:00Z"))).toBe("CLOSED");
  });
});

describe("invoicePaymentStatus", () => {
  it("é UNPAID sem paidAt, mesmo com saldo zerado por coincidência", () => {
    expect(invoicePaymentStatus(0, null)).toBe("UNPAID");
    expect(invoicePaymentStatus(-5000, null)).toBe("UNPAID");
  });

  it("é PARTIALLY_PAID quando ainda sobra dívida depois de um pagamento", () => {
    expect(invoicePaymentStatus(-3400, new Date("2026-08-15T03:00:00Z"))).toBe("PARTIALLY_PAID");
  });

  it("é PAID quando o pagamento zerou o saldo", () => {
    expect(invoicePaymentStatus(0, new Date("2026-08-15T03:00:00Z"))).toBe("PAID");
  });

  it("é OVERPAID quando o saldo vira crédito, e o valor é exatamente o excedente", () => {
    expect(invoicePaymentStatus(4518, new Date("2026-08-15T03:00:00Z"))).toBe("OVERPAID");
  });

  it("um lançamento novo depois do pagamento derruba PAID para PARTIALLY_PAID sem apagar paidAt", () => {
    const paidAt = new Date("2026-08-15T03:00:00Z");
    expect(invoicePaymentStatus(0, paidAt)).toBe("PAID");
    expect(invoicePaymentStatus(-34000, paidAt)).toBe("PARTIALLY_PAID");
  });
});

describe("invoiceHistoryStart", () => {
  it("recua o número pedido de faturas a partir da atual", () => {
    const start = invoiceHistoryStart(20, 28, 3, new Date("2026-08-19T15:00:00Z"));

    expect(start.toISOString()).toBe("2026-05-20T03:00:00.000Z");
  });

  it("encaixa o dia em mês curto ao recuar", () => {
    const start = invoiceHistoryStart(31, 10, 1, new Date("2026-03-05T15:00:00Z"));

    expect(start.toISOString()).toBe("2026-02-28T03:00:00.000Z");
  });
});
