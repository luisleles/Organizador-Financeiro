import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { verifyPassword } from "./server/auth/password";
import { credentialsSchema } from "./server/auth/auth.schema";
import { consumeLoginAttempt } from "./server/auth/rate-limit";
import { prisma } from "./lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // O limite é por e-mail tentado: sem ele, uma lista de senhas comuns roda à vontade.
        if (!consumeLoginAttempt(email)) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, passwordHash: true },
        });

        // Sempre compara contra algum hash: responder mais rápido para e-mail inexistente
        // conta a quem está tentando quais e-mails existem.
        const ok = await verifyPassword(password, user?.passwordHash);
        if (!user || !ok) return null;

        return { id: user.id, name: user.name, email: user.email };
      },
    }),
  ],
});
