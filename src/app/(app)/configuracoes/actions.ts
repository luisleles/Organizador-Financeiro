"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { signOut } from "@/auth";
import {
  actionError,
  actionSuccess,
  type ActionState,
  type FieldErrors,
} from "@/server/action-state";
import { AuthServiceError, changePassword, eraseAllData } from "@/server/auth/auth.service";
import { changePasswordSchema, eraseSchema } from "@/server/auth/auth.schema";
import { writeValuesHidden } from "@/server/preferences";

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = {
    currentPassword: readText(formData, "currentPassword"),
    newPassword: readText(formData, "newPassword"),
    confirmPassword: readText(formData, "confirmPassword"),
  };

  const parsed = changePasswordSchema.safeParse(submitted);
  // Senha digitada nunca volta para a tela: o formulário recomeça em branco.
  if (!parsed.success) return invalidForm(parsed.error);

  try {
    await changePassword(parsed.data);
  } catch (error) {
    if (error instanceof AuthServiceError) return actionError(error.message);
    throw error;
  }

  return actionSuccess("Senha alterada.");
}

export async function setValuesHiddenAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const hidden = readText(formData, "hidden") === "true";
  await writeValuesHidden(hidden);

  revalidatePath("/", "layout");
  return actionSuccess(hidden ? "Valores escondidos." : "Valores à mostra.");
}

/**
 * Apagar tudo pede senha e frase de confirmação — duas barreiras deliberadas, porque não há
 * desfazer. A conta de acesso sobrevive: o que some são os dados financeiros.
 */
export async function eraseAllDataAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = eraseSchema.safeParse({
    password: readText(formData, "password"),
    confirmation: readText(formData, "confirmation"),
  });
  if (!parsed.success) return invalidForm(parsed.error);

  try {
    const resumo = await eraseAllData(parsed.data.password);
    revalidatePath("/", "layout");

    return actionSuccess(
      `Tudo apagado: ${resumo.transactions} lançamentos, ${resumo.accounts} contas, ${resumo.categories} categorias e ${resumo.goals} metas.`,
    );
  } catch (error) {
    if (error instanceof AuthServiceError) return actionError(error.message);
    throw error;
  }
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function invalidForm(error: z.ZodError): ActionState {
  const { fieldErrors } = z.flattenError(error);
  return actionError("Revise os campos destacados.", fieldErrors as FieldErrors);
}
