import { createDatabaseDump, exportFileName } from "@/server/export/export.service";

export const dynamic = "force-dynamic";

/** Dump do SQLite inteiro. A restauração está documentada em `docs/IMPORTACAO.md`. */
export async function GET() {
  const dump = await createDatabaseDump();

  return new Response(new Uint8Array(dump), {
    headers: {
      "content-type": "application/x-sqlite3",
      "content-length": String(dump.byteLength),
      "content-disposition": `attachment; filename="${exportFileName("db")}"`,
    },
  });
}
