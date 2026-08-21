import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";
import { securityHeaders } from "@/server/security/headers";

const { auth } = NextAuth(authConfig);

/**
 * `/sem-conexao` é pública porque o service worker a guarda e a exibe justamente quando não
 * há como falar com o servidor — inclusive antes de haver sessão.
 */
const PUBLIC_ROUTES = ["/login", "/sem-conexao"];

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
   * responder a quem ainda não tem sessão, porque é por elas que a sessão nasce —, o
   * healthcheck, que o Docker consulta sem cookie nenhum, e os arquivos do PWA: um
   * `sw.js` que responde 307 para o login não registra, e um manifesto que redireciona
   * faz o celular deixar de oferecer a instalação, tudo isso em silêncio.
   *
   * Tudo o mais entra, inclusive `/api/exportar` e `/api/backup`: são rotas que despejam o
   * banco inteiro, e é justamente o tipo de coisa que não pode ficar de fora por descuido.
   */
  matcher: [
    "/((?!api/auth|api/saude|_next/static|_next/image|favicon.ico|icones/|sw.js|manifest.webmanifest|.*\\.(?:svg|png|jpg|ico)$).*)",
  ],
};
