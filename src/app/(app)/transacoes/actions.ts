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
  AmountExpressionError,
  evaluateAmountExpression,
} from "@/server/transactions/transaction.amount";
import {
  transactionIdsSchema,
  transactionInputSchema,
  transferInputSchema,
} from "@/server/transactions/transaction.schema";
import {
  TransactionServiceError,
  categorizeTransactions,
  createTransaction,
  createTransfer,
  deleteTransactions,
  deleteTransfer,
  getTransfer,
  tagTransactions,
  updateTransaction,
  updateTransfer,
} from "@/server/transactions/transaction.service";

/** O campo de valor aceita conta simples; quem resolve é o domínio, não o `eval`. */
const amountExpression = z
  .string()
  .trim()
  .min(1, "Informe um valor")
  .transform((value, ctx) => {
    try {
      const cents = Math.abs(evaluateAmountExpression(value));
      if (cents === 0) {
        ctx.addIssue({ code: "custom", message: "O valor precisa ser maior que zero" });
        return z.NEVER;
      }
      return cents;
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof AmountExpressionError ? error.message : "Valor inválido",
      });
      return z.NEVER;
    }
  });

const optionalId = z
  .string()
  .trim()
  .transform((value) => value || null);

const transactionFormSchema = z
  .object({
    date: z.string(),
    description: z.string(),
    amountCents: amountExpression,
    type: z.string(),
    accountId: z.string(),
    categoryId: optionalId,
    tagIds: z.array(z.string()),
    notes: z.string().optional(),
  })
  .pipe(transactionInputSchema);

const transferFormSchema = z
  .object({
    date: z.string(),
    description: z.string(),
    amountCents: amountExpression,
    fromAccountId: z.string(),
    toAccountId: z.string(),
    notes: z.string().optional(),
  })
  .pipe(transferInputSchema);

export async function createTransactionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readTransactionForm(formData);
  const parsed = transactionFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createTransaction(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/transacoes");
  return actionSuccess("Lançamento salvo.");
}

export async function updateTransactionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const transactionId = readText(formData, "transactionId");
  if (!transactionId) return actionError("Lançamento inválido.");

  const submitted = readTransactionForm(formData);
  const parsed = transactionFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateTransaction(transactionId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/transacoes");
  return actionSuccess("Lançamento atualizado.");
}

export async function createTransferAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readTransferForm(formData);
  const parsed = transferFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createTransfer(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  return actionSuccess("Transferência registrada.");
}

export async function updateTransferAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const transferGroupId = readText(formData, "transferGroupId");
  if (!transferGroupId) return actionError("Transferência inválida.");

  const submitted = readTransferForm(formData);
  const parsed = transferFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateTransfer(transferGroupId, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  return actionSuccess("Transferência atualizada.");
}

export async function deleteTransferAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const transferGroupId = readText(formData, "transferGroupId");
  if (!transferGroupId) return actionError("Transferência inválida.");

  try {
    await deleteTransfer(transferGroupId);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/transacoes");
  revalidatePath("/contas");
  return actionSuccess("Transferência excluída.");
}

export async function deleteTransactionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ids = transactionIdsSchema.safeParse(formData.getAll("ids"));
  if (!ids.success) return actionError("Selecione ao menos um lançamento.");

  try {
    const removed = await deleteTransactions(ids.data);
    revalidatePath("/transacoes");
    revalidatePath("/contas");
    return actionSuccess(
      removed === 1 ? "1 lançamento excluído." : `${removed} lançamentos excluídos.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function categorizeTransactionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ids = transactionIdsSchema.safeParse(formData.getAll("ids"));
  const categoryId = readText(formData, "categoryId");
  if (!ids.success) return actionError("Selecione ao menos um lançamento.");
  if (!categoryId) return actionError("Escolha uma categoria.");

  try {
    const updated = await categorizeTransactions(ids.data, categoryId);
    revalidatePath("/transacoes");
    return actionSuccess(
      updated === ids.data.length
        ? `${updated} lançamentos categorizados.`
        : `${updated} categorizados. Transferências ficaram de fora.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

export async function tagTransactionsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ids = transactionIdsSchema.safeParse(formData.getAll("ids"));
  const tagId = readText(formData, "tagId");
  if (!ids.success) return actionError("Selecione ao menos um lançamento.");
  if (!tagId) return actionError("Escolha uma etiqueta.");

  try {
    const updated = await tagTransactions(ids.data, tagId);
    revalidatePath("/transacoes");
    return actionSuccess(`Etiqueta aplicada em ${updated} lançamentos.`);
  } catch (error) {
    return toActionError(error);
  }
}

function readTransactionForm(formData: FormData) {
  return {
    date: readText(formData, "date"),
    description: readText(formData, "description"),
    amountCents: readText(formData, "amountCents"),
    type: readText(formData, "type"),
    accountId: readText(formData, "accountId"),
    categoryId: readText(formData, "categoryId"),
    tagIds: formData.getAll("tagIds").filter((value): value is string => typeof value === "string"),
    notes: readText(formData, "notes"),
  };
}

function readTransferForm(formData: FormData) {
  return {
    date: readText(formData, "date"),
    description: readText(formData, "description"),
    amountCents: readText(formData, "amountCents"),
    fromAccountId: readText(formData, "fromAccountId"),
    toAccountId: readText(formData, "toAccountId"),
    notes: readText(formData, "notes"),
  };
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function invalidForm(error: z.ZodError, values: Record<string, unknown>): ActionState {
  const { fieldErrors } = z.flattenError(error);
  const textValues = Object.fromEntries(
    Object.entries(values).filter(([, value]) => typeof value === "string"),
  ) as Record<string, string>;

  return actionError("Revise os campos destacados.", fieldErrors as FieldErrors, textValues);
}

function toActionError(error: unknown): ActionState {
  if (error instanceof TransactionServiceError) return actionError(error.message);
  throw error;
}

/** Carrega uma transferência para edição: uma linha sozinha não sabe a conta do outro lado. */
export async function loadTransferAction(transferGroupId: string) {
  return getTransfer(transferGroupId);
}
