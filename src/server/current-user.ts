import { auth } from "@/auth";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sessão expirada. Entre de novo para continuar.");
    this.name = "UnauthenticatedError";
  }
}

/**
 * O dono dos dados na requisição atual. Todo serviço filtra por este id — é o ponto único
 * onde a identidade entra no domínio, e por isso é o ponto único que precisa estar certo.
 *
 * Antes da autenticação isto devolvia "o primeiro usuário do banco". Agora vem da sessão, e
 * uma requisição sem sessão não chega a consultar nada: quebra aqui.
 */
export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) throw new UnauthenticatedError();

  return userId;
}
