"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionSuccess, type ActionState } from "@/server/action-state";
import { confirmImport, previewImport, ImportServiceError } from "@/server/import/import.service";
import { confirmImportSchema, previewRequestSchema } from "@/server/import/import.schema";
import type { PreviewState } from "@/server/import/import.types";

/**
 * Roda o pipeline e devolve a revisão para a tela. Nenhuma escrita acontece aqui — é essa
 * separação que garante a regra da fase: nada entra no banco sem confirmação explícita.
 */
export async function previewImportAction(payload: unknown): Promise<PreviewState> {
  const parsed = previewRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: "error", message: firstIssue(parsed.error) };

  try {
    return { status: "ready", preview: await previewImport(parsed.data) };
  } catch (error) {
    if (error instanceof ImportServiceError) return { status: "error", message: error.message };
    throw error;
  }
}

export async function confirmImportAction(payload: unknown): Promise<ActionState> {
  const parsed = confirmImportSchema.safeParse(payload);
  if (!parsed.success) return actionError(firstIssue(parsed.error));

  try {
    const { createdCount, skippedCount, rejectedCount } = await confirmImport(parsed.data);
    revalidatePath("/transacoes");
    revalidatePath("/contas");
    revalidatePath("/");

    const partes = [
      `${createdCount} ${createdCount === 1 ? "lançamento importado" : "lançamentos importados"}.`,
    ];
    if (skippedCount > 0) partes.push(`${skippedCount} já existiam e foram ignorados.`);
    if (rejectedCount > 0) {
      partes.push(
        `${rejectedCount} ${rejectedCount === 1 ? "linha entraria como receita num cartão e foi recusada" : "linhas entrariam como receita num cartão e foram recusadas"}.`,
      );
    }

    return actionSuccess(partes.join(" "));
  } catch (error) {
    if (error instanceof ImportServiceError) return actionError(error.message);
    throw error;
  }
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dados inválidos.";
}
