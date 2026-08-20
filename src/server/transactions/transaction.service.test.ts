import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { DEFAULT_FILTERS, type TransactionFilters } from "./transaction.filters";
import {
  TransactionServiceError,
  categorizeTransactions,
  createTransaction,
  createTransfer,
  deleteTransactions,
  deleteTransfer,
  getTransfer,
  listTransactions,
  tagTransactions,
  updateTransaction,
  updateTransfer,
} from "./transaction.service";

let checkingId: string;
let savingsId: string;
let foodId: string;
let salaryId: string;
let tagId: string;

const AUGUST: ResolvedPeriod = {
  start: new Date("2026-08-01T03:00:00.000Z"),
  end: new Date("2026-09-01T02:59:59.999Z"),
  label: "agosto de 2026",
};

function filters(overrides: Partial<TransactionFilters> = {}): TransactionFilters {
  return { ...DEFAULT_FILTERS, ...overrides };
}

async function legsOf(transferGroupId: string) {
  return prisma.transaction.findMany({
    where: { transferGroupId },
    orderBy: { amountCents: "asc" },
    select: { accountId: true, amountCents: true, type: true, date: true, description: true },
  });
}

beforeAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "teste@example.com", passwordHash: "x" },
  });

  const [checking, savings] = await Promise.all([
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Corrente",
        type: "CHECKING",
        class: "ASSET",
        initialBalanceCents: 0,
        color: "#0B6E75",
        icon: "landmark",
      },
    }),
    prisma.account.create({
      data: {
        userId: user.id,
        name: "Poupança",
        type: "SAVINGS",
        class: "ASSET",
        initialBalanceCents: 0,
        color: "#2653D9",
        icon: "piggy-bank",
      },
    }),
  ]);

  const [food, salary, tag] = await Promise.all([
    prisma.category.create({
      data: { userId: user.id, name: "Alimentação", kind: "EXPENSE", color: "#A85B12", icon: "x" },
    }),
    prisma.category.create({
      data: { userId: user.id, name: "Salário", kind: "INCOME", color: "#0B6E75", icon: "x" },
    }),
    prisma.tag.create({ data: { userId: user.id, name: "Fixo", color: "#3B474C" } }),
  ]);

  checkingId = checking.id;
  savingsId = savings.id;
  foodId = food.id;
  salaryId = salary.id;
  tagId = tag.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
});

describe("transferência", () => {
  const input = {
    date: "2026-08-10",
    description: "Reserva do mês",
    amountCents: 120000,
    fromAccountId: "",
    toAccountId: "",
    notes: null,
  };

  const transfer = () => ({ ...input, fromAccountId: checkingId, toAccountId: savingsId });

  it("cria duas linhas com o mesmo grupo e valores opostos", async () => {
    const groupId = await createTransfer(transfer());
    const legs = await legsOf(groupId);

    expect(legs).toHaveLength(2);
    expect(legs.map((leg) => leg.amountCents)).toEqual([-120000, 120000]);
    expect(legs.map((leg) => leg.accountId)).toEqual([checkingId, savingsId]);
    expect(legs.every((leg) => leg.type === "TRANSFER")).toBe(true);
  });

  it("não deixa categoria em nenhuma das pernas", async () => {
    const groupId = await createTransfer(transfer());
    const withCategory = await prisma.transaction.count({
      where: { transferGroupId: groupId, categoryId: { not: null } },
    });

    expect(withCategory).toBe(0);
  });

  it("as duas pernas somam zero, então não movem o consolidado", async () => {
    const groupId = await createTransfer(transfer());
    const total = await prisma.transaction.aggregate({
      where: { transferGroupId: groupId },
      _sum: { amountCents: true },
    });

    expect(total._sum.amountCents).toBe(0);
  });

  it("editar altera as duas pernas de uma vez", async () => {
    const groupId = await createTransfer(transfer());

    await updateTransfer(groupId, {
      ...transfer(),
      amountCents: 50000,
      description: "Reserva menor",
      date: "2026-08-15",
    });

    const legs = await legsOf(groupId);
    expect(legs.map((leg) => leg.amountCents)).toEqual([-50000, 50000]);
    expect(legs.every((leg) => leg.description === "Reserva menor")).toBe(true);
    expect(legs.every((leg) => leg.date.toISOString() === "2026-08-15T03:00:00.000Z")).toBe(true);
  });

  it("editar trocando origem e destino inverte as contas sem duplicar linha", async () => {
    const groupId = await createTransfer(transfer());

    await updateTransfer(groupId, {
      ...transfer(),
      fromAccountId: savingsId,
      toAccountId: checkingId,
    });

    const legs = await legsOf(groupId);
    expect(legs).toHaveLength(2);
    expect(legs.find((leg) => leg.amountCents < 0)?.accountId).toBe(savingsId);
    expect(legs.find((leg) => leg.amountCents > 0)?.accountId).toBe(checkingId);
  });

  it("excluir apaga as duas pernas", async () => {
    const groupId = await createTransfer(transfer());
    await deleteTransfer(groupId);

    expect(await legsOf(groupId)).toHaveLength(0);
  });

  it("excluir uma perna pela lista apaga a outra junto", async () => {
    const groupId = await createTransfer(transfer());
    const [outgoing] = await prisma.transaction.findMany({
      where: { transferGroupId: groupId, amountCents: { lt: 0 } },
      select: { id: true },
    });

    const removed = await deleteTransactions([outgoing.id]);

    expect(removed).toBe(2);
    expect(await legsOf(groupId)).toHaveLength(0);
  });

  it("recusa editar uma perna pelo formulário de lançamento comum", async () => {
    const groupId = await createTransfer(transfer());
    const [leg] = await prisma.transaction.findMany({
      where: { transferGroupId: groupId },
      select: { id: true },
    });

    await expect(
      updateTransaction(leg.id, {
        date: "2026-08-10",
        description: "Virou despesa",
        amountCents: 1000,
        type: "EXPENSE",
        accountId: checkingId,
        categoryId: foodId,
        tagIds: [],
        notes: null,
      }),
    ).rejects.toThrow(TransactionServiceError);
  });

  it("recusa editar grupo inexistente", async () => {
    await expect(updateTransfer("grupo-que-nao-existe", transfer())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("recusa grupo quebrado e não altera nada", async () => {
    const groupId = await createTransfer(transfer());
    const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
    await prisma.transaction.create({
      data: {
        userId: user.id,
        accountId: checkingId,
        date: new Date("2026-08-10T03:00:00.000Z"),
        description: "Perna órfã",
        amountCents: -1,
        type: "TRANSFER",
        transferGroupId: groupId,
      },
    });

    await expect(
      updateTransfer(groupId, { ...transfer(), amountCents: 999 }),
    ).rejects.toMatchObject({ code: "BROKEN_TRANSFER" });

    const legs = await legsOf(groupId);
    expect(legs.some((leg) => Math.abs(leg.amountCents) === 999)).toBe(false);
  });

  it("devolve a transferência no formato do formulário", async () => {
    const groupId = await createTransfer(transfer());

    expect(await getTransfer(groupId)).toEqual({
      date: "2026-08-10",
      description: "Reserva do mês",
      amountCents: 120000,
      fromAccountId: checkingId,
      toAccountId: savingsId,
      notes: null,
    });
  });

  it("nunca entra em receita nem em despesa do resumo", async () => {
    await createTransfer(transfer());
    await createTransaction({
      date: "2026-08-05",
      description: "Salário",
      amountCents: 500000,
      type: "INCOME",
      accountId: checkingId,
      categoryId: salaryId,
      tagIds: [],
      notes: null,
    });

    const { summary } = await listTransactions(AUGUST, filters());

    expect(summary.incomeCents).toBe(500000);
    expect(summary.expenseCents).toBe(0);
    expect(summary.transferCents).toBe(120000);
    expect(summary.netCents).toBe(500000);
  });
});

describe("filtros da listagem", () => {
  beforeEach(async () => {
    await createTransaction({
      date: "2026-08-05",
      description: "Salário da empresa",
      amountCents: 500000,
      type: "INCOME",
      accountId: checkingId,
      categoryId: salaryId,
      tagIds: [tagId],
      notes: null,
    });
    await createTransaction({
      date: "2026-08-10",
      description: "Mercado Dia",
      amountCents: 18790,
      type: "EXPENSE",
      accountId: checkingId,
      categoryId: foodId,
      tagIds: [],
      notes: "compra da semana",
    });
    await createTransaction({
      date: "2026-08-20",
      description: "Restaurante",
      amountCents: 9900,
      type: "EXPENSE",
      accountId: savingsId,
      categoryId: foodId,
      tagIds: [],
      notes: null,
    });
    await createTransaction({
      date: "2026-07-15",
      description: "Fora do período",
      amountCents: 1000,
      type: "EXPENSE",
      accountId: checkingId,
      categoryId: foodId,
      tagIds: [],
      notes: null,
    });
  });

  it("corta pelo período antes de qualquer outro filtro", async () => {
    const { rows, totalCount } = await listTransactions(AUGUST, filters());

    expect(totalCount).toBe(3);
    expect(rows.some((row) => row.description === "Fora do período")).toBe(false);
  });

  it("filtra por conta", async () => {
    const { rows } = await listTransactions(AUGUST, filters({ accountIds: [savingsId] }));

    expect(rows.map((row) => row.description)).toEqual(["Restaurante"]);
  });

  it("filtra por categoria", async () => {
    const { rows } = await listTransactions(AUGUST, filters({ categoryIds: [salaryId] }));

    expect(rows.map((row) => row.description)).toEqual(["Salário da empresa"]);
  });

  it("filtra por tipo", async () => {
    const { rows } = await listTransactions(AUGUST, filters({ type: "EXPENSE" }));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.amountCents < 0)).toBe(true);
  });

  it("filtra por tag", async () => {
    const { rows } = await listTransactions(AUGUST, filters({ tagIds: [tagId] }));

    expect(rows.map((row) => row.description)).toEqual(["Salário da empresa"]);
  });

  it("filtra por faixa de valor pelo módulo, pegando entrada e saída", async () => {
    const { rows } = await listTransactions(AUGUST, filters({ minCents: 9000, maxCents: 20000 }));

    expect(rows.map((row) => row.description).sort()).toEqual(["Mercado Dia", "Restaurante"]);
  });

  it("busca no texto da descrição e da observação", async () => {
    const byDescription = await listTransactions(AUGUST, filters({ search: "Mercado" }));
    const byNotes = await listTransactions(AUGUST, filters({ search: "semana" }));

    expect(byDescription.rows.map((row) => row.description)).toEqual(["Mercado Dia"]);
    expect(byNotes.rows.map((row) => row.description)).toEqual(["Mercado Dia"]);
  });

  it("combina filtros somando restrições", async () => {
    const { rows } = await listTransactions(
      AUGUST,
      filters({ accountIds: [checkingId], type: "EXPENSE", search: "Mercado" }),
    );

    expect(rows.map((row) => row.description)).toEqual(["Mercado Dia"]);
  });

  it("devolve lista vazia quando os filtros não se encontram", async () => {
    const { rows, totalCount } = await listTransactions(
      AUGUST,
      filters({ accountIds: [savingsId], categoryIds: [salaryId] }),
    );

    expect(rows).toHaveLength(0);
    expect(totalCount).toBe(0);
  });

  it("ordena por data, do mais recente para o mais antigo, por padrão", async () => {
    const { rows } = await listTransactions(AUGUST, filters());

    expect(rows.map((row) => row.description)).toEqual([
      "Restaurante",
      "Mercado Dia",
      "Salário da empresa",
    ]);
  });

  it("ordena por valor", async () => {
    const { rows } = await listTransactions(AUGUST, filters({ sort: "valor", direction: "asc" }));

    expect(rows.map((row) => row.amountCents)).toEqual([-18790, -9900, 500000]);
  });

  it("conta o total e as páginas do recorte inteiro, não da página exibida", async () => {
    const { totalCount, pageCount, page } = await listTransactions(AUGUST, filters());

    expect(totalCount).toBe(3);
    expect(pageCount).toBe(1);
    expect(page).toBe(1);
  });

  it("devolve página vazia quando a página pedida passa do fim", async () => {
    const { rows, totalCount } = await listTransactions(AUGUST, filters({ page: 5 }));

    expect(rows).toHaveLength(0);
    expect(totalCount).toBe(3);
  });
});

describe("ações em lote", () => {
  it("categoriza vários lançamentos e ignora transferência", async () => {
    const groupId = await createTransfer({
      date: "2026-08-10",
      description: "Reserva",
      amountCents: 1000,
      fromAccountId: checkingId,
      toAccountId: savingsId,
      notes: null,
    });
    const expenseId = await createTransaction({
      date: "2026-08-11",
      description: "Padaria",
      amountCents: 1500,
      type: "EXPENSE",
      accountId: checkingId,
      categoryId: null,
      tagIds: [],
      notes: null,
    });
    const legIds = (
      await prisma.transaction.findMany({
        where: { transferGroupId: groupId },
        select: { id: true },
      })
    ).map((row) => row.id);

    const updated = await categorizeTransactions([expenseId, ...legIds], foodId);

    expect(updated).toBe(1);
    const stillWithoutCategory = await prisma.transaction.count({
      where: { transferGroupId: groupId, categoryId: null },
    });
    expect(stillWithoutCategory).toBe(2);
  });

  it("adiciona a mesma etiqueta em vários lançamentos", async () => {
    const first = await createTransaction({
      date: "2026-08-11",
      description: "Padaria",
      amountCents: 1500,
      type: "EXPENSE",
      accountId: checkingId,
      categoryId: foodId,
      tagIds: [],
      notes: null,
    });
    const second = await createTransaction({
      date: "2026-08-12",
      description: "Feira",
      amountCents: 4500,
      type: "EXPENSE",
      accountId: checkingId,
      categoryId: foodId,
      tagIds: [],
      notes: null,
    });

    await tagTransactions([first, second], tagId);

    const tagged = await prisma.transaction.count({ where: { tags: { some: { id: tagId } } } });
    expect(tagged).toBe(2);
  });
});
