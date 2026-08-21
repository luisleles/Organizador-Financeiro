import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { CategoryPivotTable } from "@/components/charts/category-pivot-table";
import { CategoryTrendChart } from "@/components/charts/category-trend-chart";
import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { listCategories } from "@/server/categories/category.service";
import { MONTH_OPTIONS, parseMonthCount } from "@/server/reports/report.params";
import {
  getCashFlowReport,
  getCategoryPivot,
  getCategoryTrend,
} from "@/server/reports/report.service";

export const dynamic = "force-dynamic";

type RelatoriosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RelatoriosPage({ searchParams }: RelatoriosPageProps) {
  const params = await searchParams;
  const monthCount = parseMonthCount(typeof params.meses === "string" ? params.meses : null);
  const requestedCategory = typeof params.categoria === "string" ? params.categoria : null;

  const { flat } = await listCategories();
  const selectable = flat.filter((category) => !category.archived);
  const categoryId = requestedCategory ?? selectable[0]?.id ?? null;

  const [cashFlow, pivot, trend] = await Promise.all([
    getCashFlowReport(monthCount),
    getCategoryPivot(monthCount),
    categoryId ? getCategoryTrend(categoryId, 12) : Promise.resolve(null),
  ]);

  const csvHref = (view: string) => {
    const query = new URLSearchParams({ visao: view, meses: String(monthCount) });
    if (view === "categoria" && categoryId) query.set("categoria", categoryId);
    return `/relatorios/csv?${query}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Relatórios"
        description="Todos os números excluem transferências entre contas próprias — mover dinheiro de uma conta para outra não é receita nem despesa."
      />

      <nav aria-label="Janela de meses" className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-texto-fraco font-semibold uppercase">Janela</span>
        {MONTH_OPTIONS.map((option) => (
          <Link
            key={option}
            href={`/relatorios?meses=${option}${categoryId ? `&categoria=${categoryId}` : ""}`}
            aria-current={option === monthCount ? "page" : undefined}
            className={cn(
              "link-acao rounded-md border px-3 py-1.5 text-xs transition",
              option === monthCount
                ? "border-tinta bg-superficie text-texto font-medium"
                : "border-linha text-texto-fraco hover:border-linha-forte hover:text-texto",
            )}
          >
            {option} meses
          </Link>
        ))}
      </nav>

      <Card title="Fluxo de caixa mensal" action={<CsvLink href={csvHref("fluxo")} />}>
        <CashFlowChart months={cashFlow.months} />
      </Card>

      <Card title="Categoria mês a mês" action={<CsvLink href={csvHref("pivo")} />}>
        <CategoryPivotTable pivot={pivot} />
      </Card>

      <Card
        title="Uma categoria em 12 meses"
        action={
          <div className="flex items-center gap-3">
            <form method="get" action="/relatorios" className="flex items-center gap-2">
              <input type="hidden" name="meses" value={monthCount} />
              <label htmlFor="categoria" className="sr-only">
                Categoria
              </label>
              <Select
                id="categoria"
                name="categoria"
                defaultValue={categoryId ?? ""}
                className="h-8 w-48 text-sm"
              >
                {selectable.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
              <button
                type="submit"
                className="link-acao border-linha text-texto-fraco hover:border-linha-forte hover:text-texto rounded-md border px-2 py-1 text-xs"
              >
                Ver
              </button>
            </form>
            <CsvLink href={csvHref("categoria")} />
          </div>
        }
      >
        {trend ? (
          <div className="flex flex-col gap-4">
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <div className="flex items-center gap-2">
                <dt className="text-texto-fraco text-xs">Total em 12 meses</dt>
                <dd>
                  <Amount cents={trend.totalCents} size="sm" tone="saida" sign="never" />
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-texto-fraco text-xs">Média mensal</dt>
                <dd>
                  <Amount cents={trend.averageCents} size="sm" tone="neutro" sign="never" />
                </dd>
              </div>
            </dl>
            <CategoryTrendChart
              months={trend.months}
              averageCents={trend.averageCents}
              categoryName={trend.name}
            />
          </div>
        ) : (
          <p className="text-texto-fraco text-sm">
            Cadastre uma categoria para acompanhar a evolução dela.
          </p>
        )}
      </Card>
    </div>
  );
}

function CsvLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="link-acao text-texto-fraco hover:text-texto text-xs whitespace-nowrap"
    >
      Exportar CSV
    </Link>
  );
}
