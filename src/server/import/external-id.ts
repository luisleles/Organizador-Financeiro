/**
 * Identidade de um lançamento cuja origem não fornece uma. Precisa ser estável entre
 * importações do mesmo arquivo — é ela que faz a segunda tentativa reconhecer o que já
 * entrou — e curta o bastante para caber numa coluna sem incomodar.
 *
 * FNV-1a: não é criptográfico, e não precisa ser. Aqui só se compara igualdade de linhas
 * de extrato, num banco de um usuário só.
 */
export function stableExternalId(parts: readonly (string | number)[]): string {
  const texto = parts.map((part) => String(part).trim().toLowerCase()).join("|");

  let hash = 0x811c9dc5;
  for (let index = 0; index < texto.length; index += 1) {
    hash ^= texto.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `${hash.toString(16).padStart(8, "0")}-${texto.length.toString(16)}`;
}
