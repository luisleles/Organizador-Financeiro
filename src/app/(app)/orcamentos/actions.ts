"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseBRLInput } from "@/lib/money";
import {
  actionError,
  actionSuccess,
  type ActionState,
  type FieldErrors,
} from "@/server/action-state";
import {
  BudgetServiceError,
  copyPreviousMonth,
  removeBudget,
  setBudget,
} from "@/server/budgets/budget.service";
import { budgetInputSchema, budgetMonthSchema } from "@/server/budgets/budget.schema";

const brlToCents = z
  .string()
  .trim()
  .min(1, "Informe um limite")
  .transform((value, ctx) => {
    try {
      return Math.abs(parseBRLInput(value));
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const budgetFormSchema = z
  .object({
    categoryId: z.string(),
    month: z.string(),
    limitCents: brlToCents,
  })
  .pipe(budgetInputSchema);

export async function setBudgetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = {
    categoryId: readText(formData, "categoryId"),
    month: readText(formData, "month"),
    limitCents: readText(formData, "limitCents"),
  };

  const parsed = budgetFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await setBudget(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateBudgets();
  return actionSuccess("Limite salvo.");
}

export async function removeBudgetAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const categoryId = readText(formData, "categoryId");
  const month = budgetMonthSchema.safeParse(readText(formData, "month"));
  if (!categoryId || !month.success) return actionError("Orçamento inválido.");

  try {
    await removeBudget(categoryId, month.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateBudgets();
  return actionSuccess("Limite removido.");
}

export async function copyPreviousMonthAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const month = budgetMonthSchema.safeParse(readText(formData, "month"));
  if (!month.success) return actionError("Mês inválido.");

  try {
    const copied = await copyPreviousMonth(month.data);
    revalidateBudgets();

    return actionSuccess(
      copied === 0
        ? "Todos os limites do mês anterior já estavam definidos aqui."
        : `${copied} ${copied === 1 ? "limite copiado" : "limites copiados"} do mês anterior.`,
    );
  } catch (error) {
    return toActionError(error);
  }
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
  if (error instanceof BudgetServiceError) return actionError(error.message);
  throw error;
}

function revalidateBudgets(): void {
  revalidatePath("/orcamentos");
  revalidatePath("/");
}
