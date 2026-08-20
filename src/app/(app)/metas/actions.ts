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
  createBucketSchema,
  goalInputSchema,
  goalMovementSchema,
  yieldBatchSchema,
} from "@/server/goals/goal.schema";
import {
  GoalServiceError,
  createBucketForGoal,
  createGoal,
  depositToGoal,
  redeemGoal,
  registerYieldBatch,
  setGoalArchived,
  updateGoal,
  withdrawFromGoal,
} from "@/server/goals/goal.service";

const brlToCents = z
  .string()
  .trim()
  .min(1, "Informe um valor")
  .transform((value, ctx) => {
    try {
      return Math.abs(parseBRLInput(value));
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const optionalRate = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    const parsed = Number(value.replace(",", "."));
    if (Number.isNaN(parsed)) {
      ctx.addIssue({ code: "custom", message: "Taxa inválida" });
      return z.NEVER;
    }
    return parsed;
  });

const goalFormSchema = z
  .object({
    name: z.string(),
    targetCents: brlToCents.pipe(z.number().int().positive("O alvo precisa ser maior que zero")),
    targetDate: z.string(),
    color: z.string(),
    icon: z.string(),
    expectedYearlyRatePercent: optionalRate,
  })
  .pipe(goalInputSchema);

const movementFormSchema = z
  .object({ goalId: z.string(), amountCents: brlToCents, date: z.string() })
  .pipe(goalMovementSchema);

export async function createGoalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readGoalForm(formData);
  const parsed = goalFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    const goalId = await createGoal(parsed.data);
    const parentAccountId = readText(formData, "parentAccountId");

    // Criar já com caixinha é o caminho principal; sem conta mãe, a meta nasce em planejamento.
    if (parentAccountId) await createBucketForGoal(goalId, parentAccountId);
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

export async function createBucketAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = createBucketSchema.safeParse({
    goalId: readText(formData, "goalId"),
    parentAccountId: readText(formData, "parentAccountId"),
  });
  if (!parsed.success) return actionError("Escolha a conta mãe da caixinha.");

  try {
    await createBucketForGoal(parsed.data.goalId, parsed.data.parentAccountId);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess("Caixinha criada.");
}

export async function depositAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return movement(formData, depositToGoal, "Aporte registrado.");
}

export async function withdrawAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return movement(formData, withdrawFromGoal, "Resgate registrado.");
}

export async function registerYieldAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = readText(formData, "goalId");
  const months = formData.getAll("month").filter((v): v is string => typeof v === "string");
  const amounts = formData.getAll("amount").filter((v): v is string => typeof v === "string");

  const entries = months
    .map((month, index) => ({ month, amount: amounts[index] ?? "" }))
    .filter((entry) => entry.amount.trim() !== "")
    .map((entry) => {
      try {
        return { month: entry.month, amountCents: Math.abs(parseBRLInput(entry.amount)) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { month: string; amountCents: number } => entry !== null);

  const parsed = yieldBatchSchema.safeParse({ goalId, entries });
  if (!parsed.success) return actionError("Informe ao menos um mês com valor válido.");

  try {
    const created = await registerYieldBatch(parsed.data);
    revalidateGoals();
    return actionSuccess(
      created === 1 ? "Rendimento lançado." : `${created} rendimentos lançados.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function redeemGoalAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = readText(formData, "goalId");
  const date = readText(formData, "date");
  if (!goalId || !date) return actionError("Meta inválida.");

  try {
    const redeemed = await redeemGoal(goalId, date);
    revalidateGoals();
    return actionSuccess(`Resgatado ${(redeemed / 100).toFixed(2)} para a conta mãe.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function setGoalArchivedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const goalId = readText(formData, "goalId");
  if (!goalId) return actionError("Meta inválida.");

  try {
    await setGoalArchived(goalId, readText(formData, "archived") === "1");
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess("Meta atualizada.");
}

async function movement(
  formData: FormData,
  run: (input: { goalId: string; amountCents: number; date: string }) => Promise<void>,
  message: string,
): Promise<ActionState> {
  const submitted = {
    goalId: readText(formData, "goalId"),
    amountCents: readText(formData, "amountCents"),
    date: readText(formData, "date"),
  };

  const parsed = movementFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await run(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateGoals();
  return actionSuccess(message);
}

function readGoalForm(formData: FormData) {
  return {
    name: readText(formData, "name"),
    targetCents: readText(formData, "targetCents"),
    targetDate: readText(formData, "targetDate"),
    color: readText(formData, "color"),
    icon: readText(formData, "icon"),
    expectedYearlyRatePercent: readText(formData, "expectedYearlyRatePercent"),
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
  revalidatePath("/contas");
  revalidatePath("/transacoes");
  revalidatePath("/");
}
