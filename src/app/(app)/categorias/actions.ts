"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  actionError,
  actionSuccess,
  type ActionState,
  type FieldErrors,
} from "@/server/action-state";
import {
  archiveCategorySchema,
  categoryInputSchema,
  categoryMoveSchema,
  categoryRuleInputSchema,
  tagInputSchema,
} from "@/server/categories/category.schema";
import {
  CategoryServiceError,
  applyRulesToUncategorized,
  archiveCategory,
  createCategory,
  createCategoryRule,
  deleteCategoryRule,
  moveCategory,
  unarchiveCategory,
  updateCategory,
  updateCategoryRule,
} from "@/server/categories/category.service";
import { TagServiceError, createTag, deleteTag, updateTag } from "@/server/tags/tag.service";

const optionalId = z
  .string()
  .trim()
  .transform((value) => value || null);

const categoryFormSchema = z
  .object({
    name: z.string(),
    kind: z.string(),
    color: z.string(),
    icon: z.string(),
    parentId: optionalId,
  })
  .pipe(categoryInputSchema);

const ruleFormSchema = z
  .object({
    pattern: z.string(),
    categoryId: z.string(),
    priority: z.string().transform((value) => Number(value || 0)),
    active: z.string().transform((value) => value === "on" || value === "true"),
  })
  .pipe(categoryRuleInputSchema);

const tagFormSchema = z.object({ name: z.string(), color: z.string() }).pipe(tagInputSchema);

export async function createCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readCategoryForm(formData);
  const parsed = categoryFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createCategory(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  return actionSuccess("Categoria criada.");
}

export async function updateCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const categoryId = readText(formData, "categoryId");
  if (!categoryId) return actionError("Categoria inválida.");

  const submitted = readCategoryForm(formData);
  const parsed = categoryFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateCategory(categoryId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateCategory(categoryId);
  return actionSuccess("Categoria atualizada.");
}

/** Chamada direto pelo arrasto: o payload é estruturado, não um formulário. */
export async function moveCategoryAction(request: unknown): Promise<ActionState> {
  const parsed = categoryMoveSchema.safeParse(request);
  if (!parsed.success) return actionError("Movimento inválido.");

  try {
    await moveCategory(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  return actionSuccess("Ordem atualizada.");
}

export async function archiveCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = archiveCategorySchema.safeParse({
    categoryId: readText(formData, "categoryId"),
    reassignToId: readText(formData, "reassignToId") || null,
  });
  if (!parsed.success) return actionError("Categoria inválida.");

  try {
    const moved = await archiveCategory(parsed.data);
    revalidateCategory(parsed.data.categoryId);
    revalidatePath("/transacoes");

    return actionSuccess(
      moved === 0
        ? "Categoria arquivada."
        : `Categoria arquivada e ${moved} ${moved === 1 ? "lançamento realocado" : "lançamentos realocados"}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function unarchiveCategoryAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const categoryId = readText(formData, "categoryId");
  if (!categoryId) return actionError("Categoria inválida.");

  try {
    await unarchiveCategory(categoryId);
  } catch (error) {
    return toActionError(error);
  }

  revalidateCategory(categoryId);
  return actionSuccess("Categoria reativada.");
}

export async function createCategoryRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readRuleForm(formData);
  const parsed = ruleFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createCategoryRule(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  return actionSuccess("Regra criada.");
}

export async function updateCategoryRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ruleId = readText(formData, "ruleId");
  if (!ruleId) return actionError("Regra inválida.");

  const submitted = readRuleForm(formData);
  const parsed = ruleFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateCategoryRule(ruleId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  return actionSuccess("Regra atualizada.");
}

export async function deleteCategoryRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ruleId = readText(formData, "ruleId");
  if (!ruleId) return actionError("Regra inválida.");

  try {
    await deleteCategoryRule(ruleId);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  return actionSuccess("Regra excluída.");
}

export async function reprocessUncategorizedAction(
  _previous: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const classified = await applyRulesToUncategorized();

  revalidatePath("/categorias");
  revalidatePath("/transacoes");

  return actionSuccess(
    classified === 0
      ? "Nenhum lançamento sem categoria casou com as regras."
      : `${classified} ${classified === 1 ? "lançamento categorizado" : "lançamentos categorizados"}.`,
  );
}

export async function createTagAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = { name: readText(formData, "name"), color: readText(formData, "color") };
  const parsed = tagFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createTag(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  return actionSuccess("Etiqueta criada.");
}

export async function updateTagAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tagId = readText(formData, "tagId");
  if (!tagId) return actionError("Etiqueta inválida.");

  const submitted = { name: readText(formData, "name"), color: readText(formData, "color") };
  const parsed = tagFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateTag(tagId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/categorias");
  revalidatePath("/transacoes");
  return actionSuccess("Etiqueta atualizada.");
}

export async function deleteTagAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const tagId = readText(formData, "tagId");
  if (!tagId) return actionError("Etiqueta inválida.");

  try {
    const detached = await deleteTag(tagId);
    revalidatePath("/categorias");
    revalidatePath("/transacoes");

    return actionSuccess(
      detached === 0
        ? "Etiqueta excluída."
        : `Etiqueta excluída e removida de ${detached} ${detached === 1 ? "lançamento" : "lançamentos"}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

function readCategoryForm(formData: FormData) {
  return {
    name: readText(formData, "name"),
    kind: readText(formData, "kind"),
    color: readText(formData, "color"),
    icon: readText(formData, "icon"),
    parentId: readText(formData, "parentId"),
  };
}

function readRuleForm(formData: FormData) {
  return {
    pattern: readText(formData, "pattern"),
    categoryId: readText(formData, "categoryId"),
    priority: readText(formData, "priority"),
    active: readText(formData, "active") || "false",
  };
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function invalidForm(error: z.ZodError, values: Record<string, string>): ActionState {
  const { fieldErrors } = z.flattenError(error);
  return actionError("Revise os campos destacados.", fieldErrors as FieldErrors, values);
}

function toActionError(error: unknown): ActionState {
  if (error instanceof CategoryServiceError || error instanceof TagServiceError) {
    return actionError(error.message);
  }
  throw error;
}

function revalidateCategory(categoryId: string): void {
  revalidatePath("/categorias");
  revalidatePath(`/categorias/${categoryId}`);
}
