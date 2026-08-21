"use server";

import { AuthError } from "next-auth";
import { z } from "zod";
import { signIn } from "@/auth";
import {
  actionError,
  actionSuccess,
  type ActionState,
  type FieldErrors,
} from "@/server/action-state";
import { AuthServiceError, createFirstUser } from "@/server/auth/auth.service";
import { MIN_PASSWORD_LENGTH, credentialsSchema } from "@/server/auth/auth.schema";
import { peekLoginAttempt } from "@/server/auth/rate-limit";

const firstUserSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome").max(80, "Nome longo demais"),
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use ao menos ${MIN_PASSWORD_LENGTH} caracteres`),
});

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = {
    email: readText(formData, "email"),
    password: readText(formData, "password"),
  };

  const parsed = credentialsSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, { email: submitted.email });

  // Consulta sem consumir: quem já estourou o limite recebe a mensagem certa, em vez de um
  // "e-mail ou senha inválidos" que faria a pessoa tentar de novo à toa. Quem conta a
  // tentativa é o `authorize`, que é quem realmente confere a senha.
  const limite = peekLoginAttempt(parsed.data.email);
  if (!limite.allowed) {
    return actionError(
      `Muitas tentativas. Espere ${Math.max(1, Math.ceil(limite.retryAfterMs / 60_000))} minutos e tente de novo.`,
      undefined,
      { email: submitted.email },
    );
  }

  try {
    await signIn("credentials", {
      ...parsed.data,
      redirectTo: safeDestination(readText(formData, "destino")),
    });
  } catch (error) {
    // `signIn` sinaliza o sucesso lançando o redirecionamento: só o que é AuthError é falha.
    if (error instanceof AuthError) {
      return actionError("E-mail ou senha inválidos.", undefined, { email: submitted.email });
    }
    throw error;
  }

  return actionSuccess("Bem-vindo de volta.");
}

/** Primeira execução: enquanto não existe conta, esta é a tela de cadastro. */
export async function createFirstUserAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const submitted = {
    name: readText(formData, "name"),
    email: readText(formData, "email"),
    password: readText(formData, "password"),
  };

  const parsed = firstUserSchema.safeParse(submitted);
  if (!parsed.success) return invalidForm(parsed.error, submitted);

  try {
    await createFirstUser(parsed.data);
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthServiceError) return actionError(error.message);
    if (error instanceof AuthError) return actionError("Conta criada, mas o login falhou.");
    throw error;
  }

  return actionSuccess("Conta criada.");
}

/** Só caminho interno: um destino externo transformaria o login num redirecionador aberto. */
function safeDestination(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function invalidForm(error: z.ZodError, values: Record<string, string>): ActionState {
  const { fieldErrors } = z.flattenError(error);
  return actionError("Revise os campos destacados.", fieldErrors as FieldErrors, values);
}
