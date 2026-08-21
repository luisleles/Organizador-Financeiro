import type { NextAuthConfig } from "next-auth";
import { APP_URL, isSecureOrigin } from "@/lib/app-url";

const THIRTY_DAYS = 60 * 60 * 24 * 30;
const ONE_DAY = 60 * 60 * 24;

/**
 * A parte da configuração que roda no middleware, na borda: sem Prisma, sem bcrypt, sem
 * nada de Node. É por isso que ela vive separada de `auth.ts` — o middleware precisa
 * decidir se a pessoa está logada olhando só o JWT do cookie.
 */
export const authConfig = {
  pages: { signIn: "/login" },

  /**
   * O endereço canônico vem de `APP_URL`, e nunca de `localhost` fixo no código: quando o
   * app é aberto pelo nome do Tailscale no celular, um canônico errado faz o Auth.js
   * montar o callback para a máquina errada e o login falha **sem mensagem** — a pessoa
   * digita a senha, a tela recarrega e nada acontece.
   */
  basePath: "/api/auth",
  trustHost: true,

  session: {
    strategy: "jwt",
    maxAge: THIRTY_DAYS,
    /**
     * Renovação deslizante: a cada dia de uso o token é reemitido com prazo cheio. Quem
     * abre o app no celular uma vez por semana nunca vê a tela de login de novo; quem
     * some por trinta dias, sim.
     */
    updateAge: ONE_DAY,
  },

  /**
   * `Secure` só entra quando a origem é HTTPS. Com Tailscale Serve é sempre o caso; numa
   * LAN em HTTP puro, marcar `Secure` faria o navegador descartar o cookie em silêncio, e
   * o login entraria num laço de "entrar e voltar para a tela de entrar".
   */
  useSecureCookies: isSecureOrigin(APP_URL),

  cookies: {
    sessionToken: {
      name: isSecureOrigin(APP_URL) ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isSecureOrigin(APP_URL),
      },
    },
  },

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
