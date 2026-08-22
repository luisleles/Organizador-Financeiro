import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { formatDate } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { ImportServiceError, confirmImport, previewImport } from "./import.service";
import type { PreviewRequest } from "./import.schema";

const EXTRATO_CSV = [
  "Data;Historico;Valor",
  "15/08/2026;Mercado do bairro;-125,90",
  "16/08/2026;Salario agosto;7.200,00",
  "17/08/2026;Compra sem regra;-40,00",
].join("\n");

let userId: string;
let contaId: string;
let categoriaId: string;

function pedido(overrides: Partial<PreviewRequest> = {}): PreviewRequest {
  return {
    sourceId: "csv",
    accountId: contaId,
    text: EXTRATO_CSV,
    since: null,
    dateFormat: "DD/MM/AAAA",
    headerRows: 1,
    mapping: { date: 0, description: 1, amount: 2 },
    ...overrides,
  } as PreviewRequest;
}

async function gravadas() {
  return prisma.transaction.findMany({
    orderBy: { date: "asc" },
    select: {
      date: true,
      description: true,
      amountCents: true,
      type: true,
      provider: true,
      externalId: true,
      categoryId: true,
    },
  });
}

beforeAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "import@example.com", passwordHash: "x" },
  });
  userId = user.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.categoryRule.deleteMany();
  await prisma.account.deleteMany();
  await prisma.category.deleteMany();

  const [conta, categoria] = await Promise.all([
    prisma.account.create({
      data: {
        userId,
        name: "Corrente",
        type: "CHECKING",
        class: "ASSET",
        initialBalanceCents: 0,
        color: "#2653D9",
        icon: "landmark",
      },
    }),
    prisma.category.create({
      data: { userId, name: "Supermercado", kind: "EXPENSE", color: "#A85B12", icon: "cart" },
    }),
  ]);

  contaId = conta.id;
  categoriaId = categoria.id;

  await prisma.categoryRule.create({
    data: { userId, pattern: "mercado", categoryId: categoriaId, priority: 1, active: true },
  });
});

describe("previewImport", () => {
  it("não grava nada: a revisão é só leitura", async () => {
    await previewImport(pedido());
    expect(await gravadas()).toEqual([]);
  });

  it("marca tudo como novo na primeira leitura", async () => {
    const { rows, totals } = await previewImport(pedido());

    expect(totals).toMatchObject({ total: 3, novos: 3, duplicados: 0 });
    expect(rows.every((row) => row.status === "novo")).toBe(true);
  });

  it("sugere categoria pela regra e conta quem ficou sem", async () => {
    const { rows, totals } = await previewImport(pedido());

    expect(rows[0].categoryId).toBe(categoriaId);
    expect(rows[0].categoryName).toBe("Supermercado");
    expect(totals.semCategoria).toBe(2);
  });

  it("reconhece como duplicado o que já foi importado", async () => {
    const primeira = await previewImport(pedido());
    await confirmImport({
      sourceId: "csv",
      accountId: contaId,
      rows: primeira.rows.map(toConfirmRow),
    });

    const segunda = await previewImport(pedido());
    expect(segunda.totals).toMatchObject({ total: 3, novos: 0, duplicados: 3 });
  });

  it("lê OFX pela mesma porta, sem mapeamento de coluna", async () => {
    const { rows, totals } = await previewImport(
      pedido({
        sourceId: "ofx",
        text: "<STMTTRN><DTPOSTED>20260815<TRNAMT>-10.00<FITID>OFX-1<MEMO>Mercado central</STMTTRN>",
      }),
    );

    expect(totals.novos).toBe(1);
    expect(rows[0].externalId).toBe("OFX-1");
    expect(rows[0].categoryId).toBe(categoriaId);
  });

  it("recusa arquivo do qual não sai lançamento nenhum", async () => {
    await expect(previewImport(pedido({ text: "linha sem sentido" }))).rejects.toMatchObject({
      code: "EMPTY_FILE",
    });
  });

  it("recusa conta que não é do usuário", async () => {
    await expect(previewImport(pedido({ accountId: "nao-existe" }))).rejects.toBeInstanceOf(
      ImportServiceError,
    );
  });

  it("respeita o corte de data", async () => {
    const { totals } = await previewImport(pedido({ since: "2026-08-16" }));
    expect(totals.total).toBe(2);
  });
});

describe("confirmImport", () => {
  it("grava só o que foi selecionado", async () => {
    const { rows } = await previewImport(pedido());
    const result = await confirmImport({
      sourceId: "csv",
      accountId: contaId,
      rows: [toConfirmRow(rows[0])],
    });

    expect(result.createdCount).toBe(1);
    const salvas = await gravadas();
    expect(salvas).toHaveLength(1);
    expect(salvas[0].description).toBe("Mercado do bairro");
    expect(salvas[0].provider).toBe("csv");
  });

  it("guarda o sinal como tipo e valor positivo", async () => {
    const { rows } = await previewImport(pedido());
    await confirmImport({ sourceId: "csv", accountId: contaId, rows: rows.map(toConfirmRow) });

    const salvas = await gravadas();
    expect(salvas.map((row) => [row.type, row.amountCents])).toEqual([
      ["EXPENSE", -12590],
      ["INCOME", 720000],
      ["EXPENSE", -4000],
    ]);
    expect(formatDate(salvas[0].date)).toBe("15/08/2026");
  });

  it("confirmar duas vezes não duplica", async () => {
    const { rows } = await previewImport(pedido());
    const payload = { sourceId: "csv" as const, accountId: contaId, rows: rows.map(toConfirmRow) };

    const primeira = await confirmImport(payload);
    const segunda = await confirmImport(payload);

    expect(primeira.createdCount).toBe(3);
    expect(segunda.createdCount).toBe(0);
    expect(segunda.skippedCount).toBe(3);
    expect(await gravadas()).toHaveLength(3);
  });

  it("respeita a regra de operação por classe de conta: linha positiva num cartão não vira receita", async () => {
    const cartao = await prisma.account.create({
      data: {
        userId,
        name: "Cartão",
        type: "CREDIT_CARD",
        class: "LIABILITY",
        initialBalanceCents: 0,
        color: "#B0234A",
        icon: "credit-card",
        creditCardDetails: { create: { closingDay: 20, dueDay: 28, creditLimitCents: 1_000_000 } },
      },
    });

    const { rows } = await previewImport(pedido({ accountId: cartao.id }));
    const result = await confirmImport({
      sourceId: "csv",
      accountId: cartao.id,
      rows: rows.map(toConfirmRow),
    });

    // Só a linha de salário (positiva) é recusada; as duas despesas entram normalmente.
    expect(result.createdCount).toBe(2);
    expect(result.rejectedCount).toBe(1);
    const salvas = await prisma.transaction.findMany({ where: { accountId: cartao.id } });
    expect(salvas.every((row) => row.type !== "INCOME")).toBe(true);
    expect(salvas).toHaveLength(2);
  });

  it("respeita a categoria escolhida na revisão, mesmo contra a regra", async () => {
    const outra = await prisma.category.create({
      data: { userId, name: "Lazer", kind: "EXPENSE", color: "#7A5AF8", icon: "smile" },
    });

    const { rows } = await previewImport(pedido());
    await confirmImport({
      sourceId: "csv",
      accountId: contaId,
      rows: [{ ...toConfirmRow(rows[0]), categoryId: outra.id }],
    });

    const [salva] = await gravadas();
    expect(salva.categoryId).toBe(outra.id);
  });

  it("importar o mesmo lançamento por fontes diferentes não colide", async () => {
    const csv = await previewImport(pedido());
    await confirmImport({ sourceId: "csv", accountId: contaId, rows: [toConfirmRow(csv.rows[0])] });

    const ofx = await previewImport(
      pedido({
        sourceId: "ofx",
        text: "<STMTTRN><DTPOSTED>20260815<TRNAMT>-125.90<FITID>OFX-9<MEMO>Mercado do bairro</STMTTRN>",
      }),
    );
    const result = await confirmImport({
      sourceId: "ofx",
      accountId: contaId,
      rows: [toConfirmRow(ofx.rows[0])],
    });

    expect(result.createdCount).toBe(1);
    expect(await gravadas()).toHaveLength(2);
  });
});

function toConfirmRow(row: {
  externalId: string;
  date: string;
  description: string;
  amountCents: number;
  categoryId: string | null;
}) {
  return {
    externalId: row.externalId,
    date: row.date,
    description: row.description,
    amountCents: row.amountCents,
    categoryId: row.categoryId,
  };
}
