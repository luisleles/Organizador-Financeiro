import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import type { TagInput } from "@/server/categories/category.schema";
import type { TagSummary } from "@/server/categories/category.types";

export type TagErrorCode = "NOT_FOUND" | "IN_USE";

export class TagServiceError extends Error {
  constructor(
    readonly code: TagErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TagServiceError";
  }
}

export async function listTags(): Promise<TagSummary[]> {
  const userId = await requireUserId();

  const tags = await prisma.tag.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      color: true,
      _count: { select: { transactions: true } },
    },
  });

  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color,
    transactionCount: tag._count.transactions,
  }));
}

export async function createTag(input: TagInput): Promise<string> {
  const userId = await requireUserId();
  const created = await prisma.tag.create({ data: { userId, ...input }, select: { id: true } });

  return created.id;
}

export async function updateTag(tagId: string, input: TagInput): Promise<void> {
  const userId = await requireUserId();
  const { count } = await prisma.tag.updateMany({ where: { id: tagId, userId }, data: input });

  if (count === 0) throw notFound();
}

/**
 * Etiqueta não tem arquivamento: a relação com lançamento é N:N, então apagar apenas
 * desfaz os vínculos, sem levar nada junto. Ainda assim a exclusão avisa quantos
 * lançamentos perdem a etiqueta — quem decide é quem está olhando.
 */
export async function deleteTag(tagId: string): Promise<number> {
  const userId = await requireUserId();

  return prisma.$transaction(async (tx) => {
    const tag = await tx.tag.findFirst({
      where: { id: tagId, userId },
      select: { _count: { select: { transactions: true } } },
    });
    if (!tag) throw notFound();

    await tx.tag.delete({ where: { id: tagId } });
    return tag._count.transactions;
  });
}

function notFound(): TagServiceError {
  return new TagServiceError("NOT_FOUND", "Etiqueta não encontrada.");
}
