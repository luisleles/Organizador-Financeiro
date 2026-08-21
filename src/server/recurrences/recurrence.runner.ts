import { UnauthenticatedError } from "@/server/current-user";
import { materializeDueRecurrences } from "./recurrence.service";

/**
 * As recorrências vencidas viram lançamento quando o app abre. Rodar em toda navegação
 * seria desperdício — a geração é idempotente, mas não é de graça —, então um intervalo
 * curto em memória segura as chamadas seguidas do mesmo processo. A garantia de não
 * duplicar não depende disto: ela está na chave única da ocorrência, no banco.
 */
const MIN_INTERVAL_MS = 60_000;

let lastRunAt = 0;

function isDynamicUsage(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof error.digest === "string" &&
    error.digest.startsWith("DYNAMIC_SERVER_USAGE")
  );
}

export async function runDueRecurrences(): Promise<void> {
  const now = Date.now();
  if (now - lastRunAt < MIN_INTERVAL_MS) return;
  lastRunAt = now;

  try {
    await materializeDueRecurrences();
  } catch (error) {
    // Sem sessão não há o que gerar: quem chegou aqui já está a caminho do login.
    if (error instanceof UnauthenticatedError) return;

    // O Next usa uma exceção para desistir do render estático. Engolir essa quebraria a
    // página; ela precisa continuar subindo.
    if (isDynamicUsage(error)) throw error;

    // Já uma recorrência que não pôde ser lançada não é motivo para a página não abrir.
    console.error("Falha ao materializar recorrências vencidas", error);
  }
}
