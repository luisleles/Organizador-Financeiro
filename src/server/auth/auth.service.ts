import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/server/current-user";
import type { ChangePasswordInput } from "./auth.schema";
import { hashPassword, verifyPassword } from "./password";
import { resetLoginAttempts } from "./rate-limit";

export type AuthErrorCode = "WRONG_PASSWORD" | "USER_EXISTS" | "NOT_FOUND";

export class AuthServiceError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AuthServiceError";
  }
}

/** O app é de uma pessoa só: enquanto não houver conta, a tela de login vira cadastro. */
export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

/**
 * Cria o único usuário do app. Recusa se já existir um: o cadastro aberto na primeira
 * execução não pode continuar aberto depois dela.
 */
export async function createFirstUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<string> {
  if (await hasAnyUser()) {
    throw new AuthServiceError("USER_EXISTS", "Este app já tem uma conta cadastrada.");
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email.trim().toLowerCase(),
      passwordHash: await hashPassword(input.password),
    },
    select: { id: true },
  });

  return user.id;
}

export async function changePassword(input: ChangePasswordInput): Promise<void> {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true },
  });
  if (!user) throw new AuthServiceError("NOT_FOUND", "Usuário não encontrado.");

  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AuthServiceError("WRONG_PASSWORD", "A senha atual não confere.");
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  resetLoginAttempts(user.email);
}

export type EraseSummary = {
  accounts: number;
  transactions: number;
  categories: number;
  goals: number;
};

/**
 * Apaga os dados financeiros e mantém a conta de acesso. A senha é pedida de novo aqui,
 * mesmo com a sessão aberta: destruir tudo não pode depender só de uma aba esquecida
 * aberta em alguma máquina.
 */
export async function eraseAllData(password: string): Promise<EraseSummary> {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  });
  if (!user) throw new AuthServiceError("NOT_FOUND", "Usuário não encontrado.");

  if (!(await verifyPassword(password, user.passwordHash))) {
    throw new AuthServiceError("WRONG_PASSWORD", "A senha não confere.");
  }

  return prisma.$transaction(async (tx) => {
    const resumo = {
      transactions: await tx.transaction.count({ where: { userId } }),
      accounts: await tx.account.count({ where: { userId } }),
      categories: await tx.category.count({ where: { userId } }),
      goals: await tx.goal.count({ where: { userId } }),
    };

    // A ordem respeita as chaves estrangeiras que não são cascata.
    await tx.transaction.deleteMany({ where: { userId } });
    await tx.recurringRule.deleteMany({ where: { userId } });
    await tx.budget.deleteMany({ where: { userId } });
    await tx.goal.deleteMany({ where: { userId } });
    await tx.categoryRule.deleteMany({ where: { userId } });
    await tx.tag.deleteMany({ where: { userId } });
    await tx.category.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId, parentAccountId: { not: null } } });
    await tx.account.deleteMany({ where: { userId } });

    return resumo;
  });
}
