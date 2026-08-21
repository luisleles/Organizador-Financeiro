import { compare, hash } from "bcryptjs";

/**
 * bcrypt com custo 12: caro o bastante para tornar força bruta impraticável e barato o
 * bastante para um login não parecer travado. A implementação é em JavaScript puro de
 * propósito — nada de módulo nativo para compilar no Docker.
 */
const COST = 12;

/** Hash de uma senha que não existe, para comparar mesmo quando o usuário não existe. */
const DUMMY_HASH = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.wPPXpQxLBAKfXpJcJfE5mXbdY0J3Xq2";

export async function hashPassword(password: string): Promise<string> {
  return hash(password, COST);
}

/**
 * Compara em tempo constante do ponto de vista de quem observa: sem hash, gasta o mesmo
 * tempo comparando contra um hash descartável, para o tempo de resposta não revelar se o
 * e-mail está cadastrado.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string | undefined | null,
): Promise<boolean> {
  const resultado = await compare(password, passwordHash ?? DUMMY_HASH);
  return passwordHash ? resultado : false;
}
