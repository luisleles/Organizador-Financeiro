import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ResolvedPeriod } from "@/lib/period";
import { requireUserId } from "@/server/current-user";
import { findMatchingRule, resolveCategoryId, type MatchableRule } from "./category.rules";
import type {
  ArchiveCategoryRequest,
  CategoryInput,
  CategoryMoveRequest,
  CategoryRuleInput,
} from "./category.schema";
import { buildMonthlyTotals, comparePeriods } from "./category.stats";
import { CategoryTreeError, buildCategoryTree, planCategoryMove } from "./category.tree";
import type {
  CategoryDetail,
  CategoryListing,
  CategoryRuleRow,
  CategorySummary,
} from "./category.types";

export type CategoryErrorCode =
  | "NOT_FOUND"
  | "HAS_CHILDREN"
  | "PARENT_IS_CHILD"
  | "KIND_MISMATCH"
  | "SELF_PARENT"
  | "REASSIGN_TO_SELF"
  | "SYSTEM_CATEGORY";

export class CategoryServiceError extends Error {
  constructor(
    readonly code: CategoryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CategoryServiceError";
  }
}

const MONTHS_IN_CHART = 6;

export async function listCategories(): Promise<CategoryListing> {
  const userId = await requireUserId();

  const [categories, counts] = await Promise.all([
    prisma.category.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, categoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countById = new Map(counts.map((row) => [row.categoryId as string, row._count._all]));

  const flat: CategorySummary[] = categories.map((category) => ({
    id: category.id,
    name: category.name,
    kind: category.kind,
    color: category.color,
    icon: category.icon,
    parentId: category.parentId,
    archived: category.archived,
    sortOrder: category.sortOrder,
    transactionCount: countById.get(category.id) ?? 0,
    isSystem: category.isSystem,
  }));

  const active = flat.filter((category) => !category.archived);

  return {
    tree: buildCategoryTree(active),
    archived: flat.filter((category) => category.archived),
    flat,
  };
}

export async function getCategoryDetail(
  categoryId: string,
  period: ResolvedPeriod,
): Promise<CategoryDetail | null> {
  const userId = await requireUserId();

  const category = await prisma.category.findFirst({ where: { id: categoryId, userId } });
  if (!category) return null;

  const children = await prisma.category.findMany({
    where: { userId, parentId: categoryId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  // O total de um pai inclui o que caiu nas filhas: é assim que a pessoa pensa em "gastei
  // X com moradia", mesmo tendo lançado em "aluguel".
  const categoryIds = [categoryId, ...children.map((child) => child.id)];
  const previous = previousWindow(period);

  const [current, comparison, chartEntries, entries, counts] = await Promise.all([
    sumFor(userId, categoryIds, period.start, period.end),
    sumFor(userId, categoryIds, previous.start, previous.end),
    prisma.transaction.findMany({
      where: {
        userId,
        categoryId: { in: categoryIds },
        date: { gte: monthsBefore(period.end, MONTHS_IN_CHART - 1) },
      },
      select: { date: true, amountCents: true },
    }),
    prisma.transaction.findMany({
      where: {
        userId,
        categoryId: { in: categoryIds },
        date: { gte: period.start, lte: period.end },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        date: true,
        description: true,
        amountCents: true,
        account: { select: { name: true } },
        category: { select: { id: true, name: true } },
      },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { userId, categoryId: { in: categoryIds } },
      _count: { _all: true },
    }),
  ]);

  const countById = new Map(counts.map((row) => [row.categoryId as string, row._count._all]));
  const toSummary = (row: (typeof children)[number] | typeof category): CategorySummary => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    color: row.color,
    icon: row.icon,
    parentId: row.parentId,
    archived: row.archived,
    sortOrder: row.sortOrder,
    transactionCount: countById.get(row.id) ?? 0,
    isSystem: row.isSystem,
  });

  return {
    category: toSummary(category),
    kind: category.kind,
    children: children.map(toSummary),
    periodTotalCents: current,
    comparison: comparePeriods(current, comparison),
    monthly: buildMonthlyTotals(chartEntries, MONTHS_IN_CHART, period.end),
    entries: entries.map((entry) => ({
      id: entry.id,
      date: entry.date,
      description: entry.description,
      amountCents: entry.amountCents,
      accountName: entry.account.name,
      subcategoryName: entry.category?.id === categoryId ? null : (entry.category?.name ?? null),
    })),
  };
}

export async function createCategory(input: CategoryInput): Promise<string> {
  const userId = await requireUserId();
  await assertValidParent(userId, input, null);

  const siblings = await prisma.category.count({
    where: { userId, parentId: input.parentId },
  });

  const created = await prisma.category.create({
    data: { userId, ...input, sortOrder: siblings },
    select: { id: true },
  });

  return created.id;
}

export async function updateCategory(categoryId: string, input: CategoryInput): Promise<void> {
  const userId = await requireUserId();
  await assertNotSystem(userId, categoryId);
  await assertValidParent(userId, input, categoryId);

  const { count } = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: input,
  });

  if (count === 0) throw notFound();
}

/** Persiste um arrasto: todas as posições afetadas mudam na mesma transação, ou nenhuma. */
export async function moveCategory(request: CategoryMoveRequest): Promise<void> {
  const userId = await requireUserId();
  const categories = await prisma.category.findMany({ where: { userId, archived: false } });

  let writes;
  try {
    writes = planCategoryMove(categories, request);
  } catch (error) {
    throw toServiceError(error);
  }

  await prisma.$transaction(
    writes.map((write) =>
      prisma.category.update({
        where: { id: write.id },
        data: { parentId: write.parentId, sortOrder: write.sortOrder },
      }),
    ),
  );
}

/**
 * Arquivar não apaga nada. Se a categoria tem lançamentos, eles são realocados antes —
 * ou ficam sem categoria, se for essa a escolha. Arquivar um pai leva as filhas junto,
 * porque subcategoria órfã não aparece em lugar nenhum da interface.
 */
export async function archiveCategory(request: ArchiveCategoryRequest): Promise<number> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({
      where: { id: request.categoryId, userId },
      select: { id: true, isSystem: true },
    });
    if (!category) throw notFound();
    if (category.isSystem) throw systemCategory();

    const children = await tx.category.findMany({
      where: { userId, parentId: request.categoryId },
      select: { id: true },
    });
    const affectedIds = [category.id, ...children.map((child) => child.id)];

    if (request.reassignToId && affectedIds.includes(request.reassignToId)) {
      throw new CategoryServiceError(
        "REASSIGN_TO_SELF",
        "Escolha uma categoria que não esteja sendo arquivada.",
      );
    }

    const { count } = await tx.transaction.updateMany({
      where: { userId, categoryId: { in: affectedIds } },
      data: { categoryId: request.reassignToId },
    });

    await tx.category.updateMany({
      where: { userId, id: { in: affectedIds } },
      data: { archived: true },
    });

    // Regra apontando para categoria arquivada nunca mais casaria com nada de útil.
    await tx.categoryRule.updateMany({
      where: { userId, categoryId: { in: affectedIds } },
      data: { active: false },
    });

    return count;
  });
}

export async function unarchiveCategory(categoryId: string): Promise<void> {
  const userId = await requireUserId();

  const { count } = await prisma.category.updateMany({
    where: { id: categoryId, userId },
    data: { archived: false },
  });

  if (count === 0) throw notFound();
}

export async function listCategoryRules(): Promise<CategoryRuleRow[]> {
  const userId = await requireUserId();

  const rules = await prisma.categoryRule.findMany({
    where: { userId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      pattern: true,
      categoryId: true,
      priority: true,
      active: true,
      category: { select: { name: true } },
    },
  });

  return rules.map((rule) => ({
    id: rule.id,
    pattern: rule.pattern,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    priority: rule.priority,
    active: rule.active,
  }));
}

export async function createCategoryRule(input: CategoryRuleInput): Promise<string> {
  const userId = await requireUserId();
  const created = await prisma.categoryRule.create({
    data: { userId, ...input },
    select: { id: true },
  });

  return created.id;
}

export async function updateCategoryRule(ruleId: string, input: CategoryRuleInput): Promise<void> {
  const userId = await requireUserId();
  const { count } = await prisma.categoryRule.updateMany({
    where: { id: ruleId, userId },
    data: input,
  });

  if (count === 0) throw notFound();
}

export async function deleteCategoryRule(ruleId: string): Promise<void> {
  const userId = await requireUserId();
  const { count } = await prisma.categoryRule.deleteMany({ where: { id: ruleId, userId } });

  if (count === 0) throw notFound();
}

/**
 * Ponto de entrada único das regras. O lançamento manual chama isto hoje; o import de
 * extrato vai chamar a mesma função, sem duplicar a lógica de casamento.
 */
export async function resolveCategoryForDescription(
  client: Prisma.TransactionClient,
  userId: string,
  description: string,
  chosenCategoryId: string | null,
): Promise<string | null> {
  if (chosenCategoryId) return chosenCategoryId;

  const rules = await loadActiveRules(client, userId);
  return resolveCategoryId(description, null, rules);
}

/** Reprocessa o que ficou sem categoria. Devolve quantos lançamentos foram classificados. */
export async function applyRulesToUncategorized(): Promise<number> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const rules = await loadActiveRules(tx, userId);
    if (rules.length === 0) return 0;

    const pending = await tx.transaction.findMany({
      where: { userId, categoryId: null, type: { not: "TRANSFER" } },
      select: { id: true, description: true },
    });

    let classified = 0;
    for (const transaction of pending) {
      const match = findMatchingRule(transaction.description, rules);
      if (!match) continue;

      await tx.transaction.update({
        where: { id: transaction.id },
        data: { categoryId: match.categoryId },
      });
      classified += 1;
    }

    return classified;
  });
}

async function loadActiveRules(
  client: Prisma.TransactionClient,
  userId: string,
): Promise<MatchableRule[]> {
  return client.categoryRule.findMany({
    where: { userId, active: true, category: { archived: false } },
    select: { id: true, pattern: true, categoryId: true, priority: true, active: true },
  });
}

async function sumFor(
  userId: string,
  categoryIds: readonly string[],
  start: Date,
  end: Date,
): Promise<number> {
  const total = await prisma.transaction.aggregate({
    where: { userId, categoryId: { in: [...categoryIds] }, date: { gte: start, lte: end } },
    _sum: { amountCents: true },
  });

  return Math.abs(total._sum.amountCents ?? 0);
}

/** Janela imediatamente anterior, do mesmo tamanho — é com ela que o período se compara. */
function previousWindow(period: ResolvedPeriod): { start: Date; end: Date } {
  const span = period.end.getTime() - period.start.getTime();

  return {
    start: new Date(period.start.getTime() - span - 1),
    end: new Date(period.start.getTime() - 1),
  };
}

function monthsBefore(reference: Date, months: number): Date {
  const date = new Date(reference);
  date.setUTCMonth(date.getUTCMonth() - months);
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function assertValidParent(
  userId: string,
  input: CategoryInput,
  categoryId: string | null,
): Promise<void> {
  if (!input.parentId) return;
  if (input.parentId === categoryId) {
    throw new CategoryServiceError("SELF_PARENT", "Uma categoria não pode ser pai de si mesma.");
  }

  const parent = await prisma.category.findFirst({
    where: { id: input.parentId, userId },
    select: { parentId: true, kind: true },
  });
  if (!parent) throw notFound();

  if (parent.parentId !== null) {
    throw new CategoryServiceError(
      "PARENT_IS_CHILD",
      "A hierarquia tem um nível só: uma subcategoria não pode ter filhas.",
    );
  }
  if (parent.kind !== input.kind) {
    throw new CategoryServiceError(
      "KIND_MISMATCH",
      "Subcategoria precisa ser do mesmo tipo do pai.",
    );
  }
  if (categoryId) {
    const hasChildren = await prisma.category.count({ where: { userId, parentId: categoryId } });
    if (hasChildren > 0) {
      throw new CategoryServiceError(
        "HAS_CHILDREN",
        "Esta categoria tem subcategorias e não pode virar subcategoria.",
      );
    }
  }
}

function toServiceError(error: unknown): Error {
  if (!(error instanceof CategoryTreeError)) return error as Error;

  const messages: Record<string, string> = {
    NOT_FOUND: "Categoria não encontrada.",
    PARENT_NOT_FOUND: "Categoria de destino não encontrada.",
    SELF_PARENT: "Uma categoria não pode ser pai de si mesma.",
    PARENT_IS_CHILD: "A hierarquia tem um nível só.",
    HAS_CHILDREN: "Esta categoria tem subcategorias e não pode virar subcategoria.",
    KIND_MISMATCH: "Receita e despesa não se misturam na mesma árvore.",
  };

  return new CategoryServiceError(
    error.code === "PARENT_NOT_FOUND" ? "NOT_FOUND" : error.code,
    messages[error.code] ?? "Movimento inválido.",
  );
}

/**
 * Categoria de sistema é referência de outra parte do domínio — "Rendimentos" é o que
 * separa rendimento de caixinha de receita de trabalho nos relatórios. Renomear ou
 * arquivar quebraria essa leitura, então nem uma coisa nem outra é permitida.
 */
async function assertNotSystem(userId: string, categoryId: string): Promise<void> {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
    select: { isSystem: true },
  });
  if (!category) throw notFound();
  if (category.isSystem) throw systemCategory();
}

function systemCategory(): CategoryServiceError {
  return new CategoryServiceError(
    "SYSTEM_CATEGORY",
    "Esta categoria é do sistema e não pode ser editada nem arquivada.",
  );
}

function notFound(): CategoryServiceError {
  return new CategoryServiceError("NOT_FOUND", "Categoria não encontrada.");
}

/** Quantos lançamentos o botão de reprocessar tem para olhar. */
export async function countUncategorized(): Promise<number> {
  const userId = await requireUserId();

  return prisma.transaction.count({
    where: { userId, categoryId: null, type: { not: "TRANSFER" } },
  });
}
