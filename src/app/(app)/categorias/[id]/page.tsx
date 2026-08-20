import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryMark } from "@/components/categories/category-icon";
import { MonthlyChart } from "@/components/categories/monthly-chart";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { parsePeriod, resolvePeriod } from "@/lib/period";
import { getCategoryDetail } from "@/server/categories/category.service";
import { readValuesHidden } from "@/server/preferences";

type CategoriaPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CategoriaPage({ params, searchParams }: CategoriaPageProps) {
  const [{ id }, rawParams] = await Promise.all([params, await searchParams]);
  const period = resolvePeriod(parsePeriod(toSearchParams(rawParams)));

  const [detail, valuesHidden] = await Promise.all([
    getCategoryDetail(id, period),
    readValuesHidden(),
  ]);
  if (!detail) notFound();

  const { category, children, periodTotalCents, comparison, monthly, entries } = detail;
  const isIncome = category.kind === "INCOME";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <CategoryMark color={category.color} icon={category.icon} />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl">{category.name}</h1>
            <p className="text-texto-fraco flex items-center gap-2 text-sm">
              {isIncome ? "Receita" : "Despesa"}
              {children.length > 0 && (
                <Badge tone="neutro">
                  {children.length} {children.length === 1 ? "subcategoria" : "subcategorias"}
                </Badge>
              )}
            </p>
          </div>
        </div>
        <Link href="/categorias" className="text-texto-fraco hover:text-texto text-xs">
          Voltar para categorias
        </Link>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card title={`Total em ${period.label}`}>
          <div className="flex flex-col gap-3">
            <Amount
              cents={periodTotalCents}
              size="hero"
              tone={isIncome ? "entrada" : "saida"}
              sign="never"
              showCurrency
              masked={valuesHidden}
            />
            <Comparison
              deltaCents={comparison.deltaCents}
              deltaPercent={comparison.deltaPercent}
              previousCents={comparison.previousCents}
              isIncome={isIncome}
              masked={valuesHidden}
            />
            {children.length > 0 && (
              <p className="text-texto-fraco border-linha border-t pt-3 text-xs">
                Inclui o que foi lançado nas subcategorias.
              </p>
            )}
          </div>
        </Card>

        <Card title="Evolução dos últimos 6 meses">
          <MonthlyChart months={monthly} masked={valuesHidden} />
        </Card>
      </div>

      {children.length > 0 && (
        <Card title="Subcategorias">
          <ul className="flex flex-wrap gap-2">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/categorias/${child.id}`}
                  className="border-linha hover:border-linha-forte flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <CategoryMark color={child.color} icon={child.icon} size="sm" />
                  {child.name}
                  <span className="valor text-num-xs text-texto-fraco">
                    {child.transactionCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Lançamentos do período" className="overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            title="Nada nesta categoria no período"
            description="Troque o período no topo ou lance algo com esta categoria."
          />
        ) : (
          <Table caption={`Lançamentos de ${category.name}`}>
            <thead>
              <tr>
                <TableHeadCell>Data</TableHeadCell>
                <TableHeadCell>Descrição</TableHeadCell>
                <TableHeadCell className="hidden sm:table-cell">Conta</TableHeadCell>
                <TableHeadCell value>Valor</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <TableCell muted>
                    <span className="valor text-num-xs">{formatDate(entry.date)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {entry.description}
                      {entry.subcategoryName && (
                        <Badge tone="neutro">{entry.subcategoryName}</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell muted className="hidden sm:table-cell">
                    {entry.accountName}
                  </TableCell>
                  <TableCell value>
                    <Amount cents={entry.amountCents} masked={valuesHidden} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

type ComparisonProps = {
  deltaCents: number;
  deltaPercent: number | null;
  previousCents: number;
  isIncome: boolean;
  masked: boolean;
};

/** Gastar mais é ruim; receber mais é bom. O tom segue o sentido, não o sinal. */
function Comparison({
  deltaCents,
  deltaPercent,
  previousCents,
  isIncome,
  masked,
}: ComparisonProps) {
  if (previousCents === 0 && deltaCents === 0) {
    return <p className="text-texto-fraco text-xs">Sem movimento no período anterior.</p>;
  }

  const worse = isIncome ? deltaCents < 0 : deltaCents > 0;
  const tone = deltaCents === 0 ? "neutro" : worse ? "alerta" : "entrada";
  const direction = deltaCents > 0 ? "a mais" : "a menos";

  return (
    <div className="flex flex-wrap items-baseline gap-2 text-xs">
      <Amount cents={Math.abs(deltaCents)} size="xs" tone={tone} sign="never" masked={masked} />
      <span className="text-texto-fraco">
        {direction} que o período anterior
        {deltaPercent !== null && !masked && (
          <span className="valor"> ({formatPercent(deltaPercent)})</span>
        )}
      </span>
    </div>
  );
}

/** Percentual no formato brasileiro: vírgula decimal e sinal explícito. */
function formatPercent(value: number): string {
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : ""}${formatted}%`;
}

function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (typeof value === "string") params.set(key, value);
  }

  return params;
}
