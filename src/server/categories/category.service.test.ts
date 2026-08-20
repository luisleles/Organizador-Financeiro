import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { createTransaction } from "@/server/transactions/transaction.service";
import {
  CategoryServiceError,
  applyRulesToUncategorized,
  archiveCategory,
  createCategory,
  createCategoryRule,
  listCategories,
  moveCategory,
} from "./category.service";

let accountId: string;
let foodId: string;
let marketId: string;
let transportId: string;

const AUGUST: ResolvedPeriod = {
  start: new Date("2026-08-01T03:00:00.000Z"),
  end: new Date("2026-09-01T02:59:59.999Z"),
  label: "agosto de 2026",
};

async function expense(description: string, categoryId: string | null) {
  return createTransaction({
    date: "2026-08-10",
    description,
    amountCents: 5000,
    type: "EXPENSE",
    accountId,
    categoryId,
    tagIds: [],
    notes: null,
  });
}

beforeAll(async () => {
  await prisma.transaction.deleteMany();
  await prisma.categoryRule.deleteMany();
  await prisma.category.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: { name: "Teste", email: "cat@example.com", passwordHash: "x" },
  });

  const account = await prisma.account.create({
    data: {
      userId: user.id,
      name: "Corrente",
      type: "CHECKING",
      class: "ASSET",
      initialBalanceCents: 0,
      color: "#0B6E75",
      icon: "landmark",
    },
  });
  accountId = account.id;
});

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.categoryRule.deleteMany();
  await prisma.category.deleteMany();

  foodId = await createCategory({
    name: "Alimentação",
    kind: "EXPENSE",
    color: "#A85B12",
    icon: "cart",
    parentId: null,
  });
  transportId = await createCategory({
    name: "Transporte",
    kind: "EXPENSE",
    color: "#0B6E75",
    icon: "car",
    parentId: null,
  });
  marketId = await createCategory({
    name: "Mercado",
    kind: "EXPENSE",
    color: "#A85B12",
    icon: "cart",
    parentId: foodId,
  });
});

describe("hierarquia", () => {
  it("numera irmãos na ordem de criação", async () => {
    const { tree } = await listCategories();

    expect(tree.map((node) => node.name)).toEqual(["Alimentação", "Transporte"]);
    expect(tree[0].children.map((child) => child.name)).toEqual(["Mercado"]);
  });

  it("recusa criar subcategoria de tipo diferente do pai", async () => {
    await expect(
      createCategory({
        name: "Salário",
        kind: "INCOME",
        color: "#0B6E75",
        icon: "wallet",
        parentId: foodId,
      }),
    ).rejects.toMatchObject({ code: "KIND_MISMATCH" });
  });

  it("recusa um segundo nível de hierarquia", async () => {
    await expect(
      createCategory({
        name: "Feira",
        kind: "EXPENSE",
        color: "#A85B12",
        icon: "cart",
        parentId: marketId,
      }),
    ).rejects.toMatchObject({ code: "PARENT_IS_CHILD" });
  });

  it("persiste o arrasto que move subcategoria entre pais", async () => {
    await moveCategory({ categoryId: marketId, targetParentId: transportId, targetIndex: 0 });

    const { tree } = await listCategories();
    const transport = tree.find((node) => node.id === transportId);

    expect(transport?.children.map((child) => child.name)).toEqual(["Mercado"]);
    expect(tree.find((node) => node.id === foodId)?.children).toEqual([]);
  });

  it("persiste o arrasto que reordena a raiz", async () => {
    await moveCategory({ categoryId: transportId, targetParentId: null, targetIndex: 0 });

    const { tree } = await listCategories();
    expect(tree.map((node) => node.name)).toEqual(["Transporte", "Alimentação"]);
  });

  it("recusa arrastar um pai para dentro de outra categoria", async () => {
    await expect(
      moveCategory({ categoryId: foodId, targetParentId: transportId, targetIndex: 0 }),
    ).rejects.toBeInstanceOf(CategoryServiceError);
  });
});

describe("arquivar com realocação", () => {
  it("move os lançamentos para a categoria escolhida", async () => {
    await expense("Mercado Dia", marketId);
    await expense("Restaurante", foodId);

    const moved = await archiveCategory({ categoryId: foodId, reassignToId: transportId });

    expect(moved).toBe(2);
    const remaining = await prisma.transaction.count({ where: { categoryId: transportId } });
    expect(remaining).toBe(2);
  });

  it("arquiva as subcategorias junto com o pai", async () => {
    await archiveCategory({ categoryId: foodId, reassignToId: null });

    const { tree, archived } = await listCategories();
    expect(tree.map((node) => node.name)).toEqual(["Transporte"]);
    expect(archived.map((category) => category.name).sort()).toEqual(["Alimentação", "Mercado"]);
  });

  it("deixa os lançamentos sem categoria quando nenhuma é escolhida", async () => {
    await expense("Restaurante", foodId);

    await archiveCategory({ categoryId: foodId, reassignToId: null });

    expect(await prisma.transaction.count({ where: { categoryId: null } })).toBe(1);
  });

  it("recusa realocar para uma categoria que está sendo arquivada junto", async () => {
    await expect(
      archiveCategory({ categoryId: foodId, reassignToId: marketId }),
    ).rejects.toMatchObject({ code: "REASSIGN_TO_SELF" });
  });

  it("desliga as regras que apontavam para a categoria arquivada", async () => {
    await createCategoryRule({
      pattern: "mercado",
      categoryId: marketId,
      priority: 0,
      active: true,
    });

    await archiveCategory({ categoryId: foodId, reassignToId: null });

    const rule = await prisma.categoryRule.findFirstOrThrow();
    expect(rule.active).toBe(false);
  });
});

describe("regras de categorização", () => {
  it("classifica no lançamento manual quando a categoria fica em branco", async () => {
    await createCategoryRule({
      pattern: "uber",
      categoryId: transportId,
      priority: 0,
      active: true,
    });

    const id = await expense("UBER *trip 992", null);

    const created = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(created.categoryId).toBe(transportId);
  });

  it("não sobrescreve a categoria escolhida pelo usuário", async () => {
    await createCategoryRule({
      pattern: "uber",
      categoryId: transportId,
      priority: 0,
      active: true,
    });

    const id = await expense("Uber viagem", foodId);

    const created = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(created.categoryId).toBe(foodId);
  });

  it("casa ignorando acento e caixa", async () => {
    await createCategoryRule({
      pattern: "pao de acucar",
      categoryId: marketId,
      priority: 0,
      active: true,
    });

    const id = await expense("SUPERMERCADO PÃO DE AÇÚCAR", null);

    const created = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(created.categoryId).toBe(marketId);
  });

  it("reprocessa apenas o que está sem categoria", async () => {
    const uncategorized = await expense("Uber para o centro", null);
    const explicit = await expense("Uber para o aeroporto", foodId);
    await createCategoryRule({
      pattern: "uber",
      categoryId: transportId,
      priority: 0,
      active: true,
    });

    const classified = await applyRulesToUncategorized();

    expect(classified).toBe(1);
    expect(
      (await prisma.transaction.findUniqueOrThrow({ where: { id: uncategorized } })).categoryId,
    ).toBe(transportId);
    expect(
      (await prisma.transaction.findUniqueOrThrow({ where: { id: explicit } })).categoryId,
    ).toBe(foodId);
  });

  it("não faz nada quando não há regra ativa", async () => {
    await expense("Uber", null);
    await createCategoryRule({
      pattern: "uber",
      categoryId: transportId,
      priority: 0,
      active: false,
    });

    expect(await applyRulesToUncategorized()).toBe(0);
  });

  it("a regra mais específica vence a genérica", async () => {
    await createCategoryRule({
      pattern: "uber",
      categoryId: transportId,
      priority: 0,
      active: true,
    });
    await createCategoryRule({
      pattern: "uber eats",
      categoryId: foodId,
      priority: 0,
      active: true,
    });

    const id = await expense("UBER EATS pedido", null);

    const created = await prisma.transaction.findUniqueOrThrow({ where: { id } });
    expect(created.categoryId).toBe(foodId);
  });
});

describe("detalhe da categoria", () => {
  it("soma o período incluindo o que caiu nas subcategorias", async () => {
    await expense("Mercado Dia", marketId);
    await expense("Restaurante", foodId);

    const { getCategoryDetail } = await import("./category.service");
    const detail = await getCategoryDetail(foodId, AUGUST);

    expect(detail?.periodTotalCents).toBe(10000);
    expect(detail?.children.map((child) => child.name)).toEqual(["Mercado"]);
  });
});
