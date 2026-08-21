import { THEME_SCRIPT_HASH } from "@/lib/theme-script";

/**
 * Cabeçalhos de segurança de toda resposta. A CSP usa nonce em vez de `unsafe-inline`: o
 * Next injeta scripts inline no HTML, e sem nonce a única alternativa seria liberar todo
 * script inline da página — o que é o mesmo que não ter CSP contra XSS.
 *
 * O script de tema é a exceção: entra por hash, porque ele é fixo e porque um nonce nele
 * provocaria diferença de hidratação em toda página.
 *
 * `style-src` ainda precisa de `unsafe-inline` porque o Next injeta estilos inline no
 * streaming de RSC. É uma brecha bem menor: CSS inline não executa código.
 */
export function securityHeaders(): { nonce: string; headers: Record<string, string> } {
  const nonce = crypto.randomUUID().replaceAll("-", "");

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' '${THEME_SCRIPT_HASH}' 'strict-dynamic' ${development("'unsafe-eval'")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ]
    .join("; ")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    nonce,
    headers: {
      "content-security-policy": csp,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-frame-options": "DENY",
      "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
      "strict-transport-security": "max-age=63072000; includeSubDomains",
      "cross-origin-opener-policy": "same-origin",
      "cross-origin-resource-policy": "same-origin",
    },
  };
}

/** O modo de desenvolvimento do Next avalia código para o hot reload; produção não. */
function development(value: string): string {
  return process.env.NODE_ENV === "development" ? value : "";
}
