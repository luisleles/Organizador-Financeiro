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
import { TransactionServiceError } from "@/server/transactions/transaction.service";
import {
  RecurrenceServiceError,
  confirmOccurrence,
  createRecurringRule,
  deleteRecurringRule,
  restoreOccurrence,
  setOccurrenceAmount,
  setRecurringRuleActive,
  skipOccurrence,
  updateRecurringRule,
} from "@/server/recurrences/recurrence.service";
import {
  occurrenceRefSchema,
  recurringRuleInputSchema,
} from "@/server/recurrences/recurrence.schema";

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

const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)))
  .refine((value) => value === null || Number.isInteger(value), "Número inválido");

const ruleFormSchema = z
  .object({
    description: z.string(),
    amountCents: brlToCents,
    type: z.string(),
    accountId: z.string(),
    categoryId: z.string().transform((value) => value || null),
    frequency: z.string(),
    interval: z
      .string()
      .trim()
      .transform((value) => Number(value || 1)),
    dayOfMonth: optionalNumber,
    startDate: z.string(),
    endDate: z.string().transform((value) => value || null),
  })
  .pipe(recurringRuleInputSchema);

export async function createRecurringRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readRuleForm(formData);
  const parsed = ruleFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createRecurringRule(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess("Recorrência criada.");
}

export async function updateRecurringRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ruleId = readText(formData, "ruleId");
  const submitted = readRuleForm(formData);
  const parsed = ruleFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateRecurringRule(ruleId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess("Recorrência salva.");
}

export async function toggleRecurringRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ruleId = readText(formData, "ruleId");
  const active = readText(formData, "active") === "true";

  try {
    await setRecurringRuleActive(ruleId, active);
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess(active ? "Recorrência retomada." : "Recorrência pausada.");
}

export async function deleteRecurringRuleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await deleteRecurringRule(readText(formData, "ruleId"));
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess("Recorrência excluída. Os lançamentos já feitos continuam no extrato.");
}

export async function confirmOccurrenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ref = occurrenceRefSchema.safeParse(readOccurrenceRef(formData));
  if (!ref.success) return actionError("Ocorrência inválida.");

  try {
    await confirmOccurrence(ref.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess("Lançamento registrado.");
}

export async function skipOccurrenceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ref = occurrenceRefSchema.safeParse(readOccurrenceRef(formData));
  if (!ref.success) return actionError("Ocorrência inválida.");
  const restore = readText(formData, "restore") === "true";

  try {
    if (restore) await restoreOccurrence(ref.data);
    else await skipOccurrence(ref.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess(restore ? "Ocorrência de volta." : "Ocorrência pulada só desta vez.");
}

export async function setOccurrenceAmountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ref = occurrenceRefSchema.safeParse(readOccurrenceRef(formData));
  if (!ref.success) return actionError("Ocorrência inválida.");

  const amount = brlToCents.safeParse(readText(formData, "amountCents"));
  if (!amount.success) return actionError("Valor inválido.");

  try {
    await setOccurrenceAmount(ref.data, amount.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateRecurrences();
  return actionSuccess("Valor ajustado só nesta ocorrência.");
}

function readRuleForm(formData: FormData): Record<string, string> {
  return {
    description: readText(formData, "description"),
    amountCents: readText(formData, "amountCents"),
    type: readText(formData, "type"),
    accountId: readText(formData, "accountId"),
    categoryId: readText(formData, "categoryId"),
    frequency: readText(formData, "frequency"),
    interval: readText(formData, "interval"),
    dayOfMonth: readText(formData, "dayOfMonth"),
    startDate: readText(formData, "startDate"),
    endDate: readText(formData, "endDate"),
  };
}

function readOccurrenceRef(formData: FormData) {
  return { ruleId: readText(formData, "ruleId"), date: readText(formData, "date") };
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
  if (error instanceof RecurrenceServiceError) return actionError(error.message);
  if (error instanceof TransactionServiceError) return actionError(error.message);
  throw error;
}

function revalidateRecurrences(): void {
  revalidatePath("/recorrencias");
  revalidatePath("/transacoes");
  revalidatePath("/");
}
