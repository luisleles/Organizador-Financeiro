import type { NextAuthConfig } from "next-auth";

/**
 * A parte da configuração que roda no middleware, na borda: sem Prisma, sem bcrypt, sem
 * nada de Node. É por isso que ela vive separada de `auth.ts` — o middleware precisa
 * decidir se a pessoa está logada olhando só o JWT do cookie.
 */
export const authConfig = {
  pages: { signIn: "/login" },
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
