import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { createTransaction } from "@/server/transactions/transaction.service";
import {
  RECURRENCE_PROVIDER,
  confirmOccurrence,
  createRecurringRule,
  deleteRecurringRule,
  getBalanceProjection,
  listRecurringRules,
  listUpcomingOccurrences,
  materializeDueRecurrences,
  setOccurrenceAmount,
  setRecurringRuleActive,
  skipOccurrence,
  updateRecurringRule,
} from "./recurrence.service";
import type { RecurringRuleInput } from "./recurrence.schema";

/** Um dia 20 qualquer, com regras que começaram antes: sempre há coisa vencida para gerar. */
const HOJE = new Date("2026-08-20T12:00:00.000Z");

let userId: string;
let contaId: string;
let cartaoId: string;
let categoriaId: string;

function regra(overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    description: "Aluguel",
    amountCents: 180000,
    type: "EXPENSE",
    accountId: contaId,
    categoryId: categoriaId,
    frequency: "MONTHLY",
    interval: 1,
    dayOfMonth: 5,
    startDate: "2026-06-05",
    endDate: null,
    ...overrides,
  };
}

async function lancamentosGerados() {
  return prisma.transaction.findMany({
    where: { provider: RECURRENCE_PROVIDER },
    orderBy: [{ date: "asc" }, { externalId: "asc" }],
    select: { date: true, description: true, amountCents: true, externalId: true, accountId: true },
  });
}

async function saldo(accountId: string): Promise<number> {
  const [conta, movimento] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: { initialBalanceCents: true },
    }),
    prisma.transaction.aggregate({ where: { accountId }, _sum: { amountCents: true } }),
  ]);
  return conta.initialBalanceCents + (movimento._sum.amountCents ?? 0);
}

beforeAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "recorrencia@example.com", passwordHash: "x" },
  });
  userId = user.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.recurringRule.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.creditCardDetails.deleteMany();
  await prisma.account.deleteMany();
  await prisma.category.deleteMany();

  const [conta, cartao, categoria] = await Promise.all([
    prisma.account.create({
      data: {
        userId,
        name: "Corrente",
        type: "CHECKING",
        class: "ASSET",
        initialBalanceCents: 500000,
        color: "#2653D9",
        icon: "landmark",
      },
    }),
    prisma.account.create({
      data: {
        userId,
        name: "Cartão",
        type: "CREDIT_CARD",
        class: "LIABILITY",
        initialBalanceCents: 0,
        color: "#B0234A",
        icon: "credit-card",
        creditCardDetails: { create: { closingDay: 10, dueDay: 20, creditLimitCents: 1000000 } },
      },
    }),
    prisma.category.create({
      data: { userId, name: "Moradia", kind: "EXPENSE", color: "#A85B12", icon: "home" },
    }),
  ]);

  contaId = conta.id;
  cartaoId = cartao.id;
  categoriaId = categoria.id;
});

describe("materializeDueRecurrences", () => {
  it("gera uma ocorrência por mês vencido até hoje", async () => {
    await createRecurringRule(regra());
    const { createdCount } = await materializeDueRecurrences(HOJE);

    expect(createdCount).toBe(3);
    const gerados = await lancamentosGerados();
    expect(gerados.map((row) => formatDate(row.date))).toEqual([
      "05/06/2026",
      "05/07/2026",
      "05/08/2026",
    ]);
  });

  it("rodar duas vezes seguidas produz exatamente o mesmo resultado", async () => {
    await createRecurringRule(regra());

    const primeira = await materializeDueRecurrences(HOJE);
    const depoisDaPrimeira = await lancamentosGerados();

    const segunda = await materializeDueRecurrences(HOJE);
    const depoisDaSegunda = await lancamentosGerados();

    expect(primeira.createdCount).toBe(3);
    expect(segunda.createdCount).toBe(0);
    expect(depoisDaSegunda).toEqual(depoisDaPrimeira);
  });

  it("não duplica nem quando o lastRunAt volta no tempo", async () => {
    const ruleId = await createRecurringRule(regra());
    await materializeDueRecurrences(HOJE);

    // Simula relógio errado, backup restaurado ou duas abas abrindo o app ao mesmo tempo.
    await prisma.recurringRule.update({ where: { id: ruleId }, data: { lastRunAt: null } });

    const { createdCount } = await materializeDueRecurrences(HOJE);
    expect(createdCount).toBe(0);
    expect(await lancamentosGerados()).toHaveLength(3);
  });

  it("aplica o sinal do tipo no valor lançado", async () => {
    await createRecurringRule(
      regra({ description: "Salário", type: "INCOME", amountCents: 700000 }),
    );
    await materializeDueRecurrences(HOJE);

    const gerados = await lancamentosGerados();
    expect(gerados.every((row) => row.amountCents === 700000)).toBe(true);
    expect(await saldo(contaId)).toBe(500000 + 3 * 700000);
  });

  it("respeita a data de término", async () => {
    await createRecurringRule(regra({ endDate: "2026-07-06" }));
    await materializeDueRecurrences(HOJE);
    expect(await lancamentosGerados()).toHaveLength(2);
  });

  it("ignora regra pausada", async () => {
    const ruleId = await createRecurringRule(regra());
    await setRecurringRuleActive(ruleId, false);

    const { createdCount } = await materializeDueRecurrences(HOJE);
    expect(createdCount).toBe(0);
  });

  it("não gera o dia que foi pulado", async () => {
    const ruleId = await createRecurringRule(regra());
    await skipOccurrence({ ruleId, date: "2026-07-05" });
    await materializeDueRecurrences(HOJE);

    const gerados = await lancamentosGerados();
    expect(gerados.map((row) => formatDate(row.date))).toEqual(["05/06/2026", "05/08/2026"]);
  });

  it("usa o valor ajustado daquele mês", async () => {
    const ruleId = await createRecurringRule(regra());
    await setOccurrenceAmount({ ruleId, date: "2026-07-05" }, 200000);
    await materializeDueRecurrences(HOJE);

    const julho = (await lancamentosGerados()).find((row) => formatDate(row.date) === "05/07/2026");
    expect(julho?.amountCents).toBe(-200000);
  });

  it("aloca a despesa de cartão na fatura, e não no saldo da conta", async () => {
    await createRecurringRule(regra({ accountId: cartaoId, description: "Streaming" }));
    await materializeDueRecurrences(HOJE);

    const gerados = await lancamentosGerados();
    expect(gerados).toHaveLength(3);
    expect(gerados.every((row) => row.accountId === cartaoId)).toBe(true);
    expect(await saldo(contaId)).toBe(500000);
  });
});

describe("listUpcomingOccurrences", () => {
  it("lista só o que ainda vai acontecer na janela pedida", async () => {
    await createRecurringRule(regra());
    const proximos = await listUpcomingOccurrences(30, HOJE);

    expect(proximos.map((item) => formatDate(item.date))).toEqual(["05/09/2026"]);
  });

  it("marca a ocorrência pulada sem tirá-la da lista", async () => {
    const ruleId = await createRecurringRule(regra());
    await skipOccurrence({ ruleId, date: "2026-09-05" });

    const [proximo] = await listUpcomingOccurrences(30, HOJE);
    expect(proximo.skipped).toBe(true);
  });

  it("mostra o valor editado e sinaliza que ele destoa da regra", async () => {
    const ruleId = await createRecurringRule(regra());
    await setOccurrenceAmount({ ruleId, date: "2026-09-05" }, 250000);

    const [proximo] = await listUpcomingOccurrences(30, HOJE);
    expect(proximo.amountCents).toBe(250000);
    expect(proximo.edited).toBe(true);
  });

  it("ordena por data, misturando regras diferentes", async () => {
    await createRecurringRule(regra());
    await createRecurringRule(
      regra({ description: "Salário", type: "INCOME", dayOfMonth: 1, startDate: "2026-06-01" }),
    );

    const proximos = await listUpcomingOccurrences(30, HOJE);
    expect(proximos.map((item) => item.description)).toEqual(["Salário", "Aluguel"]);
  });
});

describe("confirmOccurrence", () => {
  it("antecipa a ocorrência e ela não se repete na geração seguinte", async () => {
    const ruleId = await createRecurringRule(regra());
    await materializeDueRecurrences(HOJE);
    await confirmOccurrence({ ruleId, date: "2026-09-05" });

    expect(await lancamentosGerados()).toHaveLength(4);

    const { createdCount } = await materializeDueRecurrences(new Date("2026-09-30T12:00:00.000Z"));
    expect(createdCount).toBe(0);
    expect(await lancamentosGerados()).toHaveLength(4);
  });

  it("recusa confirmar duas vezes a mesma ocorrência", async () => {
    const ruleId = await createRecurringRule(regra());
    await confirmOccurrence({ ruleId, date: "2026-09-05" });

    await expect(confirmOccurrence({ ruleId, date: "2026-09-05" })).rejects.toMatchObject({
      code: "ALREADY_MATERIALIZED",
    });
  });
});

describe("CRUD de regras", () => {
  it("mostra a próxima ocorrência de cada regra ativa", async () => {
    await createRecurringRule(regra());
    const [linha] = await listRecurringRules(HOJE);

    expect(linha.nextOccurrenceAt && formatDate(linha.nextOccurrenceAt)).toBe("05/09/2026");
    expect(linha.accountName).toBe("Corrente");
    expect(linha.categoryName).toBe("Moradia");
  });

  it("não projeta próxima data de regra pausada", async () => {
    const ruleId = await createRecurringRule(regra());
    await setRecurringRuleActive(ruleId, false);

    const [linha] = await listRecurringRules(HOJE);
    expect(linha.nextOccurrenceAt).toBeNull();
  });

  it("editar a regra muda as ocorrências seguintes", async () => {
    const ruleId = await createRecurringRule(regra());
    await updateRecurringRule(ruleId, regra({ amountCents: 190000, dayOfMonth: 12 }));

    const [proximo] = await listUpcomingOccurrences(30, HOJE);
    expect(formatDate(proximo.date)).toBe("12/09/2026");
    expect(proximo.amountCents).toBe(190000);
  });

  it("apagar a regra preserva o que ela já lançou", async () => {
    const ruleId = await createRecurringRule(regra());
    await materializeDueRecurrences(HOJE);
    await deleteRecurringRule(ruleId);

    expect(await lancamentosGerados()).toHaveLength(3);
    expect(await listRecurringRules(HOJE)).toEqual([]);
  });

  it("recusa criar regra numa caixinha", async () => {
    const caixinha = await prisma.account.create({
      data: {
        userId,
        name: "Viagem",
        type: "SAVINGS_BUCKET",
        class: "ASSET",
        initialBalanceCents: 0,
        color: "#0B6E75",
        icon: "piggy-bank",
        parentAccountId: contaId,
      },
    });

    await expect(createRecurringRule(regra({ accountId: caixinha.id }))).rejects.toMatchObject({
      code: "BUCKET_ACCOUNT",
    });
  });
});

describe("getBalanceProjection", () => {
  it("parte do saldo livre das contas de ativo", async () => {
    const projecao = await getBalanceProjection(90, HOJE);
    expect(projecao.openingCents).toBe(500000);
    expect(projecao.days).toHaveLength(91);
  });

  it("não conta o dinheiro que está numa caixinha", async () => {
    const caixinha = await prisma.account.create({
      data: {
        userId,
        name: "Viagem",
        type: "SAVINGS_BUCKET",
        class: "ASSET",
        initialBalanceCents: 0,
        color: "#0B6E75",
        icon: "piggy-bank",
        parentAccountId: contaId,
      },
    });
    const grupo = crypto.randomUUID();
    await prisma.transaction.createMany({
      data: [
        {
          userId,
          accountId: contaId,
          date: HOJE,
          description: "Aporte",
          amountCents: -100000,
          type: "TRANSFER",
          transferGroupId: grupo,
        },
        {
          userId,
          accountId: caixinha.id,
          date: HOJE,
          description: "Aporte",
          amountCents: 100000,
          type: "TRANSFER",
          transferGroupId: grupo,
        },
      ],
    });

    const projecao = await getBalanceProjection(90, HOJE);
    expect(projecao.openingCents).toBe(400000);
  });

  it("desconta a recorrência no dia previsto", async () => {
    await createRecurringRule(regra());
    const projecao = await getBalanceProjection(90, HOJE);

    const setembro = projecao.days.find((dia) => formatDate(dia.date) === "05/09/2026");
    expect(setembro?.changeCents).toBe(-180000);
    expect(projecao.days.at(-1)?.balanceCents).toBe(500000 - 3 * 180000);
  });

  it("aponta o primeiro dia negativo", async () => {
    await createRecurringRule(regra({ amountCents: 300000 }));
    const projecao = await getBalanceProjection(90, HOJE);

    expect(projecao.firstNegative && formatDate(projecao.firstNegative.date)).toBe("05/10/2026");
    expect(projecao.lowest?.balanceCents).toBe(500000 - 3 * 300000);
  });

  it("cobra a assinatura do cartão no vencimento da fatura, não no dia da compra", async () => {
    await createRecurringRule(
      regra({ accountId: cartaoId, description: "Streaming", dayOfMonth: 15 }),
    );
    const projecao = await getBalanceProjection(90, HOJE);

    const compra = projecao.days.find((dia) => formatDate(dia.date) === "15/09/2026");
    const vencimento = projecao.days.find((dia) => formatDate(dia.date) === "20/10/2026");
    expect(compra?.changeCents).toBe(0);
    expect(vencimento?.changeCents).toBe(-180000);
  });

  it("tira o dinheiro da conta no vencimento da fatura em aberto", async () => {
    await createTransaction({
      date: "2026-08-18",
      description: "Compra no cartão",
      amountCents: 45000,
      type: "EXPENSE",
      accountId: cartaoId,
      categoryId: null,
      tagIds: [],
      notes: null,
    });

    const projecao = await getBalanceProjection(90, HOJE);
    const vencimento = projecao.days.find((dia) => formatDate(dia.date) === "20/09/2026");
    expect(vencimento?.changeCents).toBe(-45000);
    expect(vencimento?.events[0].kind).toBe("fatura");
  });

  it("não conta duas vezes a fatura já paga", async () => {
    await createTransaction({
      date: "2026-08-18",
      description: "Compra no cartão",
      amountCents: 45000,
      type: "EXPENSE",
      accountId: cartaoId,
      categoryId: null,
      tagIds: [],
      notes: null,
    });
    await prisma.invoice.updateMany({ data: { status: "PAID", paidAt: HOJE } });

    const projecao = await getBalanceProjection(90, HOJE);
    expect(projecao.days.every((dia) => dia.changeCents === 0)).toBe(true);
  });

  it("ignora a ocorrência pulada", async () => {
    const ruleId = await createRecurringRule(regra());
    await skipOccurrence({ ruleId, date: "2026-09-05" });

    const projecao = await getBalanceProjection(90, HOJE);
    const setembro = projecao.days.find((dia) => formatDate(dia.date) === "05/09/2026");
    expect(setembro?.changeCents).toBe(0);
  });
});
