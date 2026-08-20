import { formatMonthLabel } from "@/server/categories/category.stats";
import { csvMoney, toCsv } from "@/server/reports/report.csv";
import {
  getCashFlowReport,
  getCategoryPivot,
  getCategoryTrend,
} from "@/server/reports/report.service";
import { parseMonthCount, parseView } from "@/server/reports/report.params";

/**
 * Exporta exatamente a visão que está na tela: os mesmos parâmetros da página montam o
 * mesmo recorte aqui. É um link comum, então funciona sem JavaScript.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const view = parseView(params.get("visao"));
  const monthCount = parseMonthCount(params.get("meses"));

  const { name, rows } = await buildRows(view, monthCount, params.get("categoria"));

  return new Response(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
    },
  });
}

async function buildRows(
  view: ReturnType<typeof parseView>,
  monthCount: number,
  categoryId: string | null,
): Promise<{ name: string; rows: string[][] }> {
  if (view === "fluxo") {
    const { months } = await getCashFlowReport(monthCount);

    return {
      name: `fluxo-de-caixa-${monthCount}-meses.csv`,
      rows: [
        ["Mês", "Receita", "Despesa", "Saldo"],
        ...months.map((month) => [
          month.month,
          csvMoney(month.incomeCents),
          csvMoney(month.expenseCents),
          csvMoney(month.netCents),
        ]),
      ],
    };
  }

  if (view === "categoria" && categoryId) {
    const trend = await getCategoryTrend(categoryId, monthCount);
    if (!trend) return { name: "categoria.csv", rows: [["Categoria não encontrada"]] };

    return {
      name: `${slug(trend.name)}-${monthCount}-meses.csv`,
      rows: [
        ["Mês", "Gasto"],
        ...trend.months.map((month) => [month.month, csvMoney(month.expenseCents)]),
        ["Total", csvMoney(trend.totalCents)],
        ["Média", csvMoney(trend.averageCents)],
      ],
    };
  }

  const pivot = await getCategoryPivot(monthCount);

  return {
    name: `categorias-por-mes-${monthCount}-meses.csv`,
    rows: [
      ["Categoria", ...pivot.months.map(formatMonthLabel), "Total"],
      ...pivot.rows.map((row) => [
        row.name,
        ...row.monthlyCents.map(csvMoney),
        csvMoney(row.totalCents),
      ]),
    ],
  };
}

function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
