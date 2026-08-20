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
import { contributionInputSchema, goalInputSchema } from "@/server/goals/goal.schema";
import {
  GoalServiceError,
  addContribution,
  createGoal,
  removeContribution,
  setGoalArchived,
  updateGoal,
} from "@/server/goals/goal.service";

const brlToCents = z
  .string()
  .trim()
  .min(1, "Informe um valor")
  .transform((value, ctx) => {
    try {
      return parseBRLInput(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const optionalId = z
  .string()
  .trim()
  .transform((value) => value || null);

const checkbox = z.string().transform((value) => value === "on" || value === "true");

const goalFormSchema = z
  .object({
    name: z.string(),
    targetCents: brlToCents.pipe(z.number().int().positive("O alvo precisa ser maior que zero")),
    targetDate: z.string(),
    color: z.string(),
    icon: z.string(),
    accountId: optionalId,
    useAccountBalance: checkbox,
  })
  .pipe(goalInputSchema);

const contributionFormSchema = z
  .object({
    goalId: z.string(),
    date: z.string(),
    amountCents: brlToCents,
    note: z.string().optional(),
  })
  .pipe(contributionInputSchema);

export async function createGoalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readGoalForm(formData);
  const parsed = goalFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createGoal(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess("Meta criada.");
}

export async function updateGoalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = readText(formData, "goalId");
  if (!goalId) return actionError("Meta inválida.");

  const submitted = readGoalForm(formData);
  const parsed = goalFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateGoal(goalId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess("Meta atualizada.");
}

export async function setGoalArchivedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = readText(formData, "goalId");
  if (!goalId) return actionError("Meta inválida.");

  const archived = readText(formData, "archived") === "1";

  try {
    await setGoalArchived(goalId, archived);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess(archived ? "Meta arquivada." : "Meta reativada.");
}

export async function addContributionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = {
    goalId: readText(formData, "goalId"),
    date: readText(formData, "date"),
    amountCents: readText(formData, "amountCents"),
    note: readText(formData, "note"),
  };

  const parsed = contributionFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await addContribution(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess("Aporte registrado.");
}

export async function removeContributionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const contributionId = readText(formData, "contributionId");
  if (!contributionId) return actionError("Aporte inválido.");

  try {
    await removeContribution(contributionId);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess("Aporte removido.");
}

function readGoalForm(formData: FormData) {
  return {
    name: readText(formData, "name"),
    targetCents: readText(formData, "targetCents"),
    targetDate: readText(formData, "targetDate"),
    color: readText(formData, "color"),
    icon: readText(formData, "icon"),
    accountId: readText(formData, "accountId"),
    useAccountBalance: readText(formData, "useAccountBalance") || "false",
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
  if (error instanceof GoalServiceError) return actionError(error.message);
  throw error;
}

function revalidateGoals(): void {
  revalidatePath("/metas");
  revalidatePath("/");
}
