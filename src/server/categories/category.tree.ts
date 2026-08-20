import type { CategoryKind } from "@prisma/client";

/**
 * Hierarquia de um nível só: uma categoria tem subcategorias, e uma subcategoria não tem
 * filhas. O Prisma não expressa profundidade máxima, então a regra vive aqui — junto com
 * o cálculo de reordenação, que é o que a interface de arrastar precisa persistir.
 */

export type FlatCategory = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  parentId: string | null;
  archived: boolean;
  sortOrder: number;
};

export type CategoryNode<T extends FlatCategory = FlatCategory> = T & {
  children: T[];
};

export type CategoryMoveError =
  | "NOT_FOUND"
  | "PARENT_NOT_FOUND"
  | "SELF_PARENT"
  | "PARENT_IS_CHILD"
  | "HAS_CHILDREN"
  | "KIND_MISMATCH";

export class CategoryTreeError extends Error {
  constructor(readonly code: CategoryMoveError) {
    super(code);
    this.name = "CategoryTreeError";
  }
}

/** Posição gravada; empate cai no nome, para a lista nunca aparecer embaralhada. */
function bySortOrder(a: FlatCategory, b: FlatCategory): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR");
}

export function buildCategoryTree<T extends FlatCategory>(
  categories: readonly T[],
): CategoryNode<T>[] {
  const roots = categories.filter((category) => category.parentId === null).sort(bySortOrder);

  return roots.map((root) => ({
    ...root,
    children: categories.filter((category) => category.parentId === root.id).sort(bySortOrder),
  }));
}

export type CategoryPosition = {
  id: string;
  parentId: string | null;
  sortOrder: number;
};

export type MoveRequest = {
  categoryId: string;
  targetParentId: string | null;
  /** Posição desejada entre os irmãos do destino, contando de zero. */
  targetIndex: number;
};

/**
 * Calcula as novas posições de todos os irmãos afetados por um arrasto. Devolve só o que
 * precisa ser gravado; quem persiste é o serviço, numa transação só.
 */
export function planCategoryMove(
  categories: readonly FlatCategory[],
  request: MoveRequest,
): CategoryPosition[] {
  const moved = categories.find((category) => category.id === request.categoryId);
  if (!moved) throw new CategoryTreeError("NOT_FOUND");

  const parent = request.targetParentId
    ? categories.find((category) => category.id === request.targetParentId)
    : null;

  if (request.targetParentId !== null) {
    if (!parent) throw new CategoryTreeError("PARENT_NOT_FOUND");
    if (parent.id === moved.id) throw new CategoryTreeError("SELF_PARENT");
    if (parent.parentId !== null) throw new CategoryTreeError("PARENT_IS_CHILD");
    if (categories.some((category) => category.parentId === moved.id)) {
      throw new CategoryTreeError("HAS_CHILDREN");
    }
    if (parent.kind !== moved.kind) throw new CategoryTreeError("KIND_MISMATCH");
  }

  const siblings = categories
    .filter(
      (category) =>
        category.parentId === request.targetParentId && category.id !== request.categoryId,
    )
    .sort(bySortOrder);

  const index = Math.max(0, Math.min(request.targetIndex, siblings.length));
  const reordered = [...siblings.slice(0, index), moved, ...siblings.slice(index)];

  const writes: CategoryPosition[] = reordered.map((category, position) => ({
    id: category.id,
    parentId: request.targetParentId,
    sortOrder: position,
  }));

  // Sair de um grupo deixa buracos na numeração do antigo: renumera ele também.
  if (moved.parentId !== request.targetParentId) {
    const previousSiblings = categories
      .filter(
        (category) => category.parentId === moved.parentId && category.id !== request.categoryId,
      )
      .sort(bySortOrder);

    writes.push(
      ...previousSiblings.map((category, position) => ({
        id: category.id,
        parentId: moved.parentId,
        sortOrder: position,
      })),
    );
  }

  return writes;
}

/** Uma categoria com filhas não pode virar subcategoria de ninguém. */
export function canBecomeChild(categories: readonly FlatCategory[], categoryId: string): boolean {
  return !categories.some((category) => category.parentId === categoryId);
}
