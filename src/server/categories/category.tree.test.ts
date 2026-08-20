import { describe, expect, it } from "vitest";
import {
  CategoryTreeError,
  buildCategoryTree,
  canBecomeChild,
  planCategoryMove,
  type FlatCategory,
} from "./category.tree";

const category = (id: string, overrides: Partial<FlatCategory> = {}): FlatCategory => ({
  id,
  name: id,
  kind: "EXPENSE",
  color: "#000000",
  icon: "tag",
  parentId: null,
  archived: false,
  sortOrder: 0,
  ...overrides,
});

describe("buildCategoryTree", () => {
  it("monta pais com suas filhas, em um nível só", () => {
    const tree = buildCategoryTree([
      category("moradia", { sortOrder: 0 }),
      category("aluguel", { parentId: "moradia", sortOrder: 1 }),
      category("contas", { parentId: "moradia", sortOrder: 0 }),
      category("lazer", { sortOrder: 1 }),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["moradia", "lazer"]);
    expect(tree[0].children.map((child) => child.id)).toEqual(["contas", "aluguel"]);
    expect(tree[1].children).toEqual([]);
  });

  it("desempata pelo nome quando a posição é a mesma", () => {
    const tree = buildCategoryTree([category("banana"), category("abacaxi")]);

    expect(tree.map((node) => node.id)).toEqual(["abacaxi", "banana"]);
  });

  it("ignora filha órfã, que não pertence a nenhum pai da lista", () => {
    const tree = buildCategoryTree([
      category("moradia"),
      category("perdida", { parentId: "sumiu" }),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["moradia"]);
  });
});

describe("planCategoryMove", () => {
  const base = [
    category("moradia", { sortOrder: 0 }),
    category("alimentacao", { sortOrder: 1 }),
    category("lazer", { sortOrder: 2 }),
    category("aluguel", { parentId: "moradia", sortOrder: 0 }),
    category("luz", { parentId: "moradia", sortOrder: 1 }),
  ];

  it("reordena irmãos na raiz", () => {
    const writes = planCategoryMove(base, {
      categoryId: "lazer",
      targetParentId: null,
      targetIndex: 0,
    });

    expect(writes).toEqual([
      { id: "lazer", parentId: null, sortOrder: 0 },
      { id: "moradia", parentId: null, sortOrder: 1 },
      { id: "alimentacao", parentId: null, sortOrder: 2 },
    ]);
  });

  it("move subcategoria entre pais e renumera os dois grupos", () => {
    const writes = planCategoryMove(base, {
      categoryId: "luz",
      targetParentId: "alimentacao",
      targetIndex: 0,
    });

    expect(writes).toContainEqual({ id: "luz", parentId: "alimentacao", sortOrder: 0 });
    expect(writes).toContainEqual({ id: "aluguel", parentId: "moradia", sortOrder: 0 });
  });

  it("promove subcategoria para a raiz", () => {
    const writes = planCategoryMove(base, {
      categoryId: "aluguel",
      targetParentId: null,
      targetIndex: 1,
    });

    expect(writes).toContainEqual({ id: "aluguel", parentId: null, sortOrder: 1 });
    expect(writes).toContainEqual({ id: "luz", parentId: "moradia", sortOrder: 0 });
  });

  it("encaixa índice fora da faixa no fim da lista", () => {
    const writes = planCategoryMove(base, {
      categoryId: "moradia",
      targetParentId: null,
      targetIndex: 99,
    });

    expect(writes.at(-1)).toEqual({ id: "moradia", parentId: null, sortOrder: 2 });
  });

  it("recusa transformar em subcategoria quem já tem filhas", () => {
    expect(() =>
      planCategoryMove(base, {
        categoryId: "moradia",
        targetParentId: "alimentacao",
        targetIndex: 0,
      }),
    ).toThrow(new CategoryTreeError("HAS_CHILDREN"));
  });

  it("recusa aninhar em uma subcategoria, que criaria um segundo nível", () => {
    expect(() =>
      planCategoryMove(base, { categoryId: "lazer", targetParentId: "aluguel", targetIndex: 0 }),
    ).toThrow(new CategoryTreeError("PARENT_IS_CHILD"));
  });

  it("recusa ser pai de si mesma", () => {
    expect(() =>
      planCategoryMove(base, { categoryId: "lazer", targetParentId: "lazer", targetIndex: 0 }),
    ).toThrow(new CategoryTreeError("SELF_PARENT"));
  });

  it("recusa misturar receita com despesa", () => {
    const withIncome = [...base, category("salario", { kind: "INCOME", sortOrder: 3 })];

    expect(() =>
      planCategoryMove(withIncome, {
        categoryId: "salario",
        targetParentId: "moradia",
        targetIndex: 0,
      }),
    ).toThrow(new CategoryTreeError("KIND_MISMATCH"));
  });

  it("recusa mover categoria que não existe", () => {
    expect(() =>
      planCategoryMove(base, { categoryId: "fantasma", targetParentId: null, targetIndex: 0 }),
    ).toThrow(new CategoryTreeError("NOT_FOUND"));
  });
});

describe("canBecomeChild", () => {
  it("é falso para quem tem filhas", () => {
    const list = [category("moradia"), category("luz", { parentId: "moradia" })];

    expect(canBecomeChild(list, "moradia")).toBe(false);
    expect(canBecomeChild(list, "luz")).toBe(true);
  });
});
