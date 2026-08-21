import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Healthcheck do contêiner. Não basta o processo estar de pé: se o banco não responde, o
 * app não serve para nada, e o orquestrador precisa saber disso.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "sem banco" }, { status: 503 });
  }
}
