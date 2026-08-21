import { exportFileName, exportTransactionsCsv } from "@/server/export/export.service";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await exportTransactionsCsv(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFileName("csv")}"`,
    },
  });
}
