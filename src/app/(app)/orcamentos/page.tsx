import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { BudgetBar } from "@/components/budgets/budget-bar";
import { BudgetForm, EditBudget, RemoveBudget } from "@/components/budgets/budget-form";
import { CopyPreviousMonth } from "@/components/budgets/copy-previous-month";
import { CategoryMark } from "@/components/categories/category-icon";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatMonthLabel } from "@/server/categories/category.stats";
import { budgetMonthSchema } from "@/server/budgets/budget.schema";
import {
  currentMonth,
  getBudgetHistory,
  getMonthlyBudgets,
  shiftMonth,
} from "@/server/budgets/budget.service";
import { readValuesHidden } from "@/server/preferences";

export const dynamic = "force-dynamic";

type OrcamentosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function OrcamentosPage({ searchParams }: OrcamentosPageProps) {
  const params = await searchParams;
  const parsed = budgetMonthSchema.safeParse(typeof params.mes === "string" ? params.mes : "");
  const month = parsed.success ? parsed.data : currentMonth();

  const [budgets, history, valuesHidden] = await Promise.all([
    getMonthlyBudgets(month),
    getBudgetHistory(month, 6),
    readValuesHidden(),
  ]);

  const { totals, rows, unbudgeted } = budgets;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orçamentos"
        description="Limite por categoria em cada mês. O limite de uma categoria-pai cobre o que foi lançado nas subcategorias."
        action={<CopyPreviousMonth month={month} />}
      />

      <nav aria-label="Mês do orçamento" className="flex items-center gap-2">
        <MonthLink month={shiftMonth(month, -1)} label="◀" title="Mês anterior" />
        <span className="valor text-num-sm text-texto min-w-28 text-center">
          {formatMonthLabel(month)}
        </span>
        <MonthLink month={shiftMonth(month, 1)} label="▶" title="Próximo mês" />
        {month !== currentMonth() && (
          <MonthLink month={currentMonth()} label="Hoje" title="Voltar para o mês atual" />
        )}
      </nav>

      <Card title="Total do mês">
        {rows.length === 0 ? (
          <p className="text-texto-fraco text-sm">
            Nenhum limite definido em {formatMonthLabel(month)}. Defina um abaixo ou copie do mês
            anterior.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1">
                <p className="text-2xs text-texto-fraco font-semibold uppercase">Gasto</p>
                <Amount
                  cents={totals.spentCents}
                  size="hero"
                  tone={totals.progress.status === "estourado" ? "alerta" : "saida"}
                  sign="never"
                  showCurrency
                  masked={valuesHidden}
                />
              </div>
              <dl className="flex gap-8">
                <Figure label="Orçado">
                  <Amount
                    cents={totals.limitCents}
                    size="md"
                    tone="neutro"
                    sign="never"
                    masked={valuesHidden}
                  />
                </Figure>
                <Figure label="Restante">
                  <Amount
                    cents={totals.progress.remainingCents}
                    size="md"
                    tone={totals.progress.remainingCents < 0 ? "alerta" : "entrada"}
                    sign="negative"
                    masked={valuesHidden}
                  />
                </Figure>
              </dl>
            </div>

            <BudgetBar progress={totals.progress} masked={valuesHidden} />

            {totals.overCount > 0 && (
              <p className="text-alerta text-sm">
                {totals.overCount === 1
                  ? "1 categoria estourou o limite."
                  : `${totals.overCount} categorias estouraram o limite.`}
              </p>
            )}
          </div>
        )}
      </Card>

      {rows.length > 0 && (
        <Card title="Por categoria">
          <ul className="flex flex-col gap-5">
            {rows.map((row) => (
              <li key={row.categoryId} className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <CategoryMark color={row.color} icon={row.icon} size="sm" />
                  <Link
                    href={`/categorias/${row.categoryId}`}
                    className="text-texto text-sm font-medium hover:underline hover:underline-offset-4"
                  >
                    {row.name}
                  </Link>
                  {row.hasChildren && <Badge tone="neutro">inclui subcategorias</Badge>}

                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-texto-fraco text-xs">
                      <Amount
                        cents={row.progress.spentCents}
                        size="xs"
                        tone="saida"
                        sign="never"
                        masked={valuesHidden}
                      />
                      {" de "}
                      <Amount
                        cents={row.progress.limitCents}
                        size="xs"
                        tone="neutro"
                        sign="never"
                        masked={valuesHidden}
                      />
                    </span>
                    <EditBudget
                      month={month}
                      categoryId={row.categoryId}
                      limitCents={row.progress.limitCents}
                    />
                    <RemoveBudget month={month} categoryId={row.categoryId} />
                  </span>
                </div>

                <BudgetBar progress={row.progress} masked={valuesHidden} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Definir novo limite">
        <BudgetForm month={month} categories={unbudgeted} />
      </Card>

      <Card title="Aderência dos últimos 6 meses">
        {history.rows.length === 0 ? (
          <p className="text-texto-fraco text-sm">
            Ainda não há histórico de orçamento para mostrar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Percentual do limite usado por categoria em cada um dos últimos seis meses
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="border-linha text-2xs text-texto-fraco border-b px-3 py-2 text-left font-semibold uppercase"
                  >
                    Categoria
                  </th>
                  {history.months.map((historyMonth) => (
                    <th
                      key={historyMonth}
                      scope="col"
                      className="border-linha text-2xs text-texto-fraco border-b px-2 py-2 text-right font-semibold uppercase"
                    >
                      {formatMonthLabel(historyMonth)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.rows.map((row) => (
                  <tr key={row.categoryId}>
                    <th
                      scope="row"
                      className="border-linha text-texto border-b px-3 py-1.5 text-left font-medium whitespace-nowrap"
                    >
                      {row.name}
                    </th>
                    {row.months.map((cell) => (
                      <td
                        key={cell.month}
                        className={cn(
                          "border-linha valor text-num-xs border-b px-2 py-1.5 text-right",
                          cell.status === "estourado" && "text-alerta",
                          cell.status === "dentro" && "text-entrada",
                          cell.status === null && "text-texto-fraco",
                        )}
                        title={
                          cell.status === null
                            ? "Sem orçamento definido neste mês"
                            : `Gasto ${Math.round(cell.spentCents / 100)} de ${Math.round(cell.limitCents / 100)}`
                        }
                      >
                        {cell.usedPercent === null ? "—" : `${Math.round(cell.usedPercent)}%`}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-texto-fraco mt-2 text-xs">
              Percentual do limite usado em cada mês. Traço quer dizer que não havia orçamento
              definido. Turquesa coube no limite, carmim estourou.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function MonthLink({ month, label, title }: { month: string; label: string; title: string }) {
  return (
    <Link
      href={`/orcamentos?mes=${month}`}
      title={title}
      aria-label={title}
      className="border-linha text-texto-fraco hover:border-linha-forte hover:text-texto rounded-md border px-2.5 py-1 text-xs transition"
    >
      {label}
    </Link>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-2xs text-texto-fraco font-semibold uppercase">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
