/**
 * O endereço canônico do app. Em `localhost` durante o desenvolvimento; o nome do Tailscale
 * (`https://maquina.tailnet.ts.net`) quando o celular entra na conversa.
 *
 * Existe como módulo próprio porque três lugares precisam concordar sobre ele — a
 * configuração do Auth.js, o manifesto do PWA e a documentação — e porque `localhost` fixo
 * no código é exatamente o que quebra o login no celular sem dar erro nenhum.
 */
export const APP_URL = normalize(
  process.env.AUTH_URL ?? process.env.APP_URL ?? "http://localhost:3000",
);

export function isSecureOrigin(url: string): boolean {
  return url.startsWith("https://");
}

function normalize(url: string): string {
  return url.trim().replace(/\/+$/, "");
}
