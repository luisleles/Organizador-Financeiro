import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { securityHeaders } from "@/server/security/headers";

const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login"];

/**
 * Duas responsabilidades, na ordem: ninguém passa sem sessão, e toda resposta sai com os
 * cabeçalhos de segurança. Roda na borda, então aqui só se olha o JWT do cookie — validar
 * senha é trabalho do `authorize`, que roda em Node com acesso ao banco.
 */
export default auth((request) => {
  const { nonce, headers } = securityHeaders();
  const isPublic = PUBLIC_ROUTES.some((route) => request.nextUrl.pathname.startsWith(route));
  const isLoggedIn = Boolean(request.auth?.user);

  if (!isLoggedIn && !isPublic) {
    const login = new URL("/login", request.nextUrl);
    // Guarda para onde a pessoa queria ir: depois de entrar, ela cai lá, e não na raiz.
    if (request.nextUrl.pathname !== "/") {
      login.searchParams.set("destino", request.nextUrl.pathname + request.nextUrl.search);
    }
    return applyHeaders(NextResponse.redirect(login), headers);
  }

  if (isLoggedIn && isPublic) {
    return applyHeaders(NextResponse.redirect(new URL("/", request.nextUrl)), headers);
  }

  const requestHeaders = new Headers((request as NextRequest).headers);
  requestHeaders.set("x-nonce", nonce);

  return applyHeaders(NextResponse.next({ request: { headers: requestHeaders } }), headers);
});

function applyHeaders(response: NextResponse, headers: Record<string, string>): NextResponse {
  for (const [nome, valor] of Object.entries(headers)) response.headers.set(nome, valor);
  return response;
}

export const config = {
  /**
   * Fora da proteção ficam os estáticos, as rotas do próprio Auth.js — que precisam
   * responder a quem ainda não tem sessão, porque é por elas que a sessão nasce — e o
   * healthcheck, que o Docker consulta sem cookie nenhum.
   *
   * Tudo o mais entra, inclusive `/api/exportar` e `/api/backup`: são rotas que despejam o
   * banco inteiro, e é justamente o tipo de coisa que não pode ficar de fora por descuido.
   */
  matcher: [
    "/((?!api/auth|api/saude|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)",
  ],
};
