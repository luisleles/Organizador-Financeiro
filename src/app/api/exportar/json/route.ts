import { exportFileName, exportFullJson } from "@/server/export/export.service";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await exportFullJson(), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportFileName("json")}"`,
    },
  });
}
