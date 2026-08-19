import { prisma } from "@/lib/prisma";

/**
 * O app é single-user: a "sessão" é a única linha de `User`. Isolar isso aqui faz com que
 * a chegada de autenticação de verdade mude um arquivo, e não cada serviço.
 */
export async function requireUserId(): Promise<string> {
  const user = await prisma.user.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });

  if (!user) {
    throw new Error("Nenhum usuário no banco. Rode `npm run db:seed` antes de abrir o app.");
  }

  return user.id;
}
