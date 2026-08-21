/**
 * Limite de tentativas de login, em memória. É o suficiente para um app single-user rodando
 * numa máquina só: sem Redis, sem tabela, sem dependência nova. O contador morre junto com o
 * processo, e isso é aceitável — reiniciar o servidor a cada tentativa é mais caro para quem
 * ataca do que esperar a janela passar.
 */

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;
const LOCKOUT_MS = 15 * 60_000;

type Bucket = {
  attempts: number[];
  lockedUntil: number;
};

const buckets = new Map<string, Bucket>();

export type RateLimitStatus = {
  allowed: boolean;
  /** Quantas tentativas ainda cabem na janela atual. */
  remaining: number;
  retryAfterMs: number;
};

/**
 * Consulta sem registrar. Existe para a tela poder dizer "espere tantos minutos" sem gastar
 * uma tentativa — quem só olha a porta não bateu nela.
 */
export function peekLoginAttempt(key: string, now: number = Date.now()): RateLimitStatus {
  const bucket = buckets.get(key);
  if (!bucket) return { allowed: true, remaining: MAX_ATTEMPTS, retryAfterMs: 0 };

  if (bucket.lockedUntil > now) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.lockedUntil - now };
  }

  const recentes = bucket.attempts.filter((instante) => now - instante < WINDOW_MS);
  return {
    allowed: recentes.length < MAX_ATTEMPTS,
    remaining: Math.max(0, MAX_ATTEMPTS - recentes.length),
    retryAfterMs: 0,
  };
}

/**
 * Registra uma tentativa e diz se ela pode prosseguir. Só quem de fato vai verificar a
 * senha chama isto: contar a mesma tentativa em dois lugares gastaria o dobro do limite.
 */
export function consumeLoginAttempt(key: string, now: number = Date.now()): boolean {
  const bucket = buckets.get(key) ?? { attempts: [], lockedUntil: 0 };

  if (bucket.lockedUntil > now) return false;

  const recentes = bucket.attempts.filter((instante) => now - instante < WINDOW_MS);
  recentes.push(now);

  if (recentes.length > MAX_ATTEMPTS) {
    buckets.set(key, { attempts: [], lockedUntil: now + LOCKOUT_MS });
    return false;
  }

  buckets.set(key, { attempts: recentes, lockedUntil: 0 });
  return true;
}

/** Login bem-sucedido zera o contador daquele e-mail. */
export function resetLoginAttempts(key: string): void {
  buckets.delete(key);
}

export function clearAllLoginAttempts(): void {
  buckets.clear();
}
