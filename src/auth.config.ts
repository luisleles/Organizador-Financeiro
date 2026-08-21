import type { NextAuthConfig } from "next-auth";

/**
 * A parte da configuração que roda no middleware, na borda: sem Prisma, sem bcrypt, sem
 * nada de Node. É por isso que ela vive separada de `auth.ts` — o middleware precisa
 * decidir se a pessoa está logada olhando só o JWT do cookie.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  /**
   * Sem isto o Auth.js recusa qualquer host que não seja Vercel e responde "problema com a
   * configuração do servidor" — em desenvolvimento ele confia sozinho, então a falha só
   * aparece no build de produção.
   *
   * Confiar no cabeçalho `Host` é seguro aqui porque este app roda numa máquina só, atrás
   * de localhost ou de um proxy reverso conhecido. Quem publicar em endereço aberto deve
   * fixar a origem em `AUTH_URL`, e aí o cabeçalho deixa de mandar.
   */
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
