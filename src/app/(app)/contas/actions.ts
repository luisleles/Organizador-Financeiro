"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { parseBRLInput } from "@/lib/money";
import {
  actionError,
  actionSuccess,
  type ActionState,
  type FieldErrors,
} from "@/server/action-state";
import {
  AccountServiceError,
  createAccount,
  deleteAccount,
  setAccountArchived,
  updateAccount,
} from "@/server/accounts/account.service";
import { accountIdSchema, accountInputSchema } from "@/server/accounts/account.schema";
import { writeValuesHidden } from "@/server/preferences";
import { fromZonedParts } from "@/lib/date";
import { TransactionServiceError, payInvoice } from "@/server/transactions/transaction.service";

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

const optionalBrlToCents = z
  .string()
  .trim()
  .transform((value, ctx) => {
    if (value === "") return null;
    try {
      return parseBRLInput(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "Valor inválido" });
      return z.NEVER;
    }
  });

const optionalDay = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : Number(value)));

const optionalText = z
  .string()
  .trim()
  .transform((value) => value || null);

/**
 * Os campos do formulário têm o mesmo nome dos campos do domínio de propósito: assim os
 * caminhos de erro do Zod caem direto no `name` do input, sem tabela de tradução.
 */
const accountFormSchema = z
  .object({
    name: z.string(),
    institution: z.string().optional(),
    type: z.string(),
    initialBalanceCents: brlToCents,
    color: z.string(),
    icon: z.string(),
    closingDay: optionalDay,
    dueDay: optionalDay,
    creditLimitCents: optionalBrlToCents,
    lastFourDigits: optionalText,
    brand: optionalText,
  })
  .pipe(accountInputSchema);

export async function createAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = readAccountForm(formData);
  const parsed = accountFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createAccount(parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/contas");
  return actionSuccess("Conta criada.");
}

export async function updateAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = accountIdSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return actionError("Conta inválida.");

  const submitted = readAccountForm(formData);
  const parsed = accountFormSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await updateAccount(accountId.data, parsed.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateAccount(accountId.data);
  return actionSuccess("Conta atualizada.");
}

export async function setAccountArchivedAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = accountIdSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return actionError("Conta inválida.");

  const archived = formData.get("archived") === "1";

  try {
    await setAccountArchived(accountId.data, archived);
  } catch (error) {
    return toActionError(error);
  }

  revalidateAccount(accountId.data);
  return actionSuccess(archived ? "Conta arquivada." : "Conta reativada.");
}

export async function deleteAccountAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const accountId = accountIdSchema.safeParse(formData.get("accountId"));
  if (!accountId.success) return actionError("Conta inválida.");

  try {
    await deleteAccount(accountId.data);
  } catch (error) {
    return toActionError(error);
  }

  revalidateAccount(accountId.data);

  // O redirect precisa vir do servidor: revalidar a rota atual re-renderiza a página da
  // conta recém-apagada, e ela cairia em `notFound()` antes de qualquer navegação feita
  // no cliente.
  redirect("/contas");
}

export async function toggleValuesHiddenAction(formData: FormData): Promise<void> {
  await writeValuesHidden(formData.get("hidden") === "1");
  revalidatePath("/contas", "layout");
}

export async function payInvoiceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const invoiceId = readText(formData, "invoiceId");
  const fromAccountId = readText(formData, "fromAccountId");
  const dateText = readText(formData, "date");
  const parsedAmount = brlToCents.safeParse(readText(formData, "amountCents"));
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!invoiceId || !fromAccountId || !dateMatch || !parsedAmount.success) {
    return actionError("Revise os dados do pagamento.");
  }

  try {
    await payInvoice(
      invoiceId,
      fromAccountId,
      Math.abs(parsedAmount.data),
      fromZonedParts({
        year: Number(dateMatch[1]),
        month: Number(dateMatch[2]),
        day: Number(dateMatch[3]),
      }),
    );
  } catch (error) {
    return toActionError(error);
  }

  revalidatePath("/contas", "layout");
  return actionSuccess("Pagamento registrado.");
}

function readAccountForm(formData: FormData) {
  return {
    name: readText(formData, "name"),
    institution: readText(formData, "institution"),
    type: readText(formData, "type"),
    initialBalanceCents: readText(formData, "initialBalanceCents"),
    color: readText(formData, "color"),
    icon: readText(formData, "icon"),
    closingDay: readText(formData, "closingDay"),
    dueDay: readText(formData, "dueDay"),
    creditLimitCents: readText(formData, "creditLimitCents"),
    lastFourDigits: readText(formData, "lastFourDigits"),
    brand: readText(formData, "brand"),
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
  if (error instanceof AccountServiceError) return actionError(error.message);
  if (error instanceof TransactionServiceError) return actionError(error.message);
  throw error;
}

function revalidateAccount(accountId: string): void {
  revalidatePath("/contas");
  revalidatePath(`/contas/${accountId}`);
}
