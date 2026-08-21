import { vi } from "vitest";
import { TEST_DATABASE_URL } from "./vitest.database";

// Precisa valer antes de qualquer import do PrismaClient, que lê a URL na construção.
process.env.DATABASE_URL = TEST_DATABASE_URL;

/**
 * Os testes de serviço exercitam o domínio, não o login. A sessão é substituída pelo único
 * usuário do banco de teste — o mesmo contrato que `requireUserId` espera em produção, sem
 * carregar o Auth.js e sem precisar de cookie em cada teste.
 */
vi.mock("@/auth", () => ({
  auth: async () => {
    const { prisma } = await import("@/lib/prisma");
    const user = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return user ? { user: { id: user.id } } : null;
  },
}));
