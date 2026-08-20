import { z } from "zod";

export const CATEGORY_KINDS = ["INCOME", "EXPENSE"] as const;

/** Paleta fechada, pelo mesmo motivo das contas: cor identifica, não decora. */
export const CATEGORY_COLORS = [
  "#0B6E75",
  "#2653D9",
  "#7A5AF8",
  "#A85B12",
  "#B0234A",
  "#4B6357",
  "#8A6D3B",
  "#3B474C",
] as const;

export const CATEGORY_ICONS = [
  "tag",
  "home",
  "cart",
  "car",
  "heart",
  "book",
  "ticket",
  "wallet",
] as const;

export const categoryInputSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(48, "Nome muito longo"),
  kind: z.enum(CATEGORY_KINDS, { message: "Selecione receita ou despesa" }),
  color: z.enum(CATEGORY_COLORS, { message: "Selecione uma cor" }),
  icon: z.enum(CATEGORY_ICONS, { message: "Selecione um ícone" }),
  parentId: z.string().nullable(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export const categoryMoveSchema = z.object({
  categoryId: z.string().min(1),
  targetParentId: z.string().nullable(),
  targetIndex: z.number().int().min(0),
});

export type CategoryMoveRequest = z.infer<typeof categoryMoveSchema>;

export type ArchiveCategoryRequest = z.infer<typeof archiveCategorySchema>;

export const archiveCategorySchema = z.object({
  categoryId: z.string().min(1),
  /** Para onde levar os lançamentos; `null` deixa tudo sem categoria. */
  reassignToId: z.string().nullable(),
});

export const categoryRuleInputSchema = z.object({
  pattern: z.string().trim().min(2, "Use ao menos 2 caracteres").max(80, "Padrão muito longo"),
  categoryId: z.string().min(1, "Selecione uma categoria"),
  priority: z.number().int().min(0).max(999),
  active: z.boolean(),
});

export type CategoryRuleInput = z.infer<typeof categoryRuleInputSchema>;

export const TAG_COLORS = CATEGORY_COLORS;

export const tagInputSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(32, "Nome muito longo"),
  color: z.enum(TAG_COLORS, { message: "Selecione uma cor" }),
});

export type TagInput = z.infer<typeof tagInputSchema>;
