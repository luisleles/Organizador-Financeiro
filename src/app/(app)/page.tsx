import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { BalanceEvolutionChart } from "@/components/charts/balance-evolution-chart";
import { CategoryBars } from "@/components/charts/category-bars";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { parsePeriod, resolvePeriod } from "@/lib/period";
import { consolidateBalances } from "@/server/accounts/account.balance";
import { readValuesHidden } from "@/server/preferences";
import { currentMonth, getMonthlyBudgets } from "@/server/budgets/budget.service";
import {
  flattenAccounts,
  getDashboard,
  listAccountBalances,
} from "@/server/reports/report.service";
import type { Variation } from "@/server/reports/report.aggregations";

type InicioPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InicioPage({ searchParams }: InicioPageProps) {
  const params = toSearchParams(await searchParams);
  const period = resolvePeriod(parsePeriod(params));

  const [dashboard, accounts, budgets, valuesHidden] = await Promise.all([
    getDashboard(period),
    listAccountBalances(),
    getMonthlyBudgets(currentMonth()),
    readValuesHidden(),
  ]);

  const overBudget = budgets.rows.filter((row) => row.progress.status === "estourado");

  // Achata a árvore para consolidar: cada conta entra uma vez, com o próprio saldo. A
  // caixinha soma como qualquer outra conta, e o disponível da mãe já exclui o que está
  // nela — não há dupla contagem.
  const consolidated = consolidateBalances(
    flattenAccounts(accounts).map((account) => ({
      balanceCents: account.balanceCents,
      isCreditCard: account.isCreditCard,
    })),
  );

  const expensesTotal = dashboard.categories.reduce(
    (total, category) => total + category.totalCents,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Início"
        description={`Retrato de ${period.label}. Transferências entre contas próprias não entram em receita nem em despesa.`}
      />

      {overBudget.length > 0 && (
        <aside
          role="alert"
          className="border-alerta bg-alerta-suave flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3"
        >
          <span className="text-alerta text-sm font-medium">
            {overBudget.length === 1
              ? "1 categoria estourou o orçamento do mês"
              : `${overBudget.length} categorias estouraram o orçamento do mês`}
          </span>
          <span className="text-texto-fraco text-sm">
            {overBudget
              .slice(0, 3)
              .map((row) => row.name)
              .join(", ")}
            {overBudget.length > 3 && ` e mais ${overBudget.length - 3}`}
          </span>
          <Link
            href="/orcamentos"
            className="text-texto hover:text-alerta ml-auto text-xs underline underline-offset-4"
          >
            Ver orçamentos
          </Link>
        </aside>
      )}

      <Card title="Patrimônio">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex flex-col gap-1">
            <p className="text-2xs text-texto-fraco font-semibold uppercase">Saldo líquido</p>
            <Amount
              cents={consolidated.netCents}
              size="hero"
              tone={consolidated.netCents < 0 ? "alerta" : "neutro"}
              sign="negative"
              showCurrency
              masked={valuesHidden}
            />
            <p className="text-texto-fraco text-xs">
              Contas {formatShort(consolidated.accountsBalanceCents)} · Faturas em aberto{" "}
              {formatShort(consolidated.openInvoicesCents)}
            </p>
          </div>

          <ul className="flex flex-1 flex-col gap-1 lg:max-w-md">
            {accounts.map((account) => (
              <li key={account.id} className="flex flex-col">
                <div className="border-linha flex items-center gap-3 border-b pb-1">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: account.color }}
                  />
                  <Link
                    href={`/contas/${account.id}`}
                    className="text-texto text-sm hover:underline hover:underline-offset-4"
                  >
                    {account.name}
                  </Link>
                  {account.isCreditCard && <Badge tone="previsto">cartão</Badge>}
                  <span className="ml-auto flex flex-col items-end">
                    <Amount
                      cents={account.totalBalanceCents}
                      size="xs"
                      tone={account.totalBalanceCents < 0 ? "alerta" : "neutro"}
                      sign="negative"
                      masked={valuesHidden}
                    />
                    {account.buckets.length > 0 && (
                      <span className="text-texto-fraco text-xs">
                        livre{" "}
                        <Amount
                          cents={account.availableBalanceCents}
                          size="xs"
                          tone="neutro"
                          sign="negative"
                          masked={valuesHidden}
                        />
                      </span>
                    )}
                  </span>
                </div>

                {account.buckets.map((bucket) => (
                  <div
                    key={bucket.id}
                    className="border-linha flex items-center gap-2 border-b py-1 pl-6"
                  >
                    <span aria-hidden className="text-texto-fraco text-xs">
                      ↳
                    </span>
                    <Link
                      href={`/contas/${bucket.id}`}
                      className="text-texto-fraco text-xs hover:underline hover:underline-offset-4"
                    >
                      {bucket.name}
                    </Link>
                    <span className="ml-auto">
                      <Amount
                        cents={bucket.balanceCents}
                        size="xs"
                        tone="entrada"
                        sign="never"
                        masked={valuesHidden}
                      />
                    </span>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <FlowCard
          label="Entradas"
          variation={dashboard.income}
          tone="entrada"
          masked={valuesHidden}
          footer={
            dashboard.yieldCents > 0 ? (
              <>
                Inclui{" "}
                <Amount
                  cents={dashboard.yieldCents}
                  size="xs"
                  tone="entrada"
                  sign="never"
                  masked={valuesHidden}
                />{" "}
                de rendimento de caixinha.
              </>
            ) : undefined
          }
        />
        <FlowCard
          label="Saídas"
          variation={dashboard.expense}
          tone="saida"
          masked={valuesHidden}
          inverted
        />
        <Card title="Sobra do período">
          <Amount
            cents={dashboard.netCents}
            size="lg"
            tone={dashboard.netCents < 0 ? "alerta" : "entrada"}
            sign="negative"
            masked={valuesHidden}
          />
          <p className="text-texto-fraco mt-1 text-xs">Entradas menos saídas.</p>
        </Card>
        <Card title="Taxa de poupança">
          {dashboard.savingsRatePercent === null ? (
            <p className="text-texto-fraco text-sm">Sem receita no período.</p>
          ) : (
            <>
              <p
                className={`valor text-num-lg ${dashboard.savingsRatePercent < 0 ? "text-alerta" : "text-entrada"}`}
              >
                {valuesHidden ? "••" : formatPercent(dashboard.savingsRatePercent)}
              </p>
              <p className="text-texto-fraco mt-1 text-xs">Quanto da receita sobrou.</p>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Gastos por categoria">
          <CategoryBars categories={dashboard.categories} totalCents={expensesTotal} />
        </Card>

        <Card title="Evolução do saldo total">
          <BalanceEvolutionChart points={dashboard.balanceEvolution} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Maiores gastos do período" className="overflow-hidden">
          {dashboard.topExpenses.length === 0 ? (
            <p className="text-texto-fraco text-sm">Nenhuma despesa no período.</p>
          ) : (
            <Table caption="Maiores gastos do período">
              <thead>
                <tr>
                  <TableHeadCell>Descrição</TableHeadCell>
                  <TableHeadCell className="hidden sm:table-cell">Categoria</TableHeadCell>
                  <TableHeadCell value>Valor</TableHeadCell>
                </tr>
              </thead>
              <tbody>
                {dashboard.topExpenses.map((expense) => (
                  <tr key={expense.id}>
                    <TableCell>
                      <span className="block">{expense.description}</span>
                      <span className="text-texto-fraco valor text-num-xs">
                        {formatDate(expense.date)} · {expense.accountName}
                      </span>
                    </TableCell>
                    <TableCell muted className="hidden sm:table-cell">
                      {expense.categoryName ?? "—"}
                    </TableCell>
                    <TableCell value>
                      <Amount cents={expense.amountCents} masked={valuesHidden} />
                    </TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>

        <Card title="Metas ativas">
          {dashboard.goals.length === 0 ? (
            <p className="text-texto-fraco text-sm">
              Nenhuma meta ativa. Metas dão um destino para a sobra do mês.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {dashboard.goals.map((goal) => (
                <li key={goal.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium">{goal.name}</span>
                    <span className="valor text-num-xs text-texto-fraco">
                      {valuesHidden ? "••" : `${Math.round(goal.percent)}%`}
                    </span>
                  </div>
                  <div className="bg-linha h-2 overflow-hidden rounded-full">
                    <div
                      className="bg-entrada-fill h-full rounded-full"
                      style={{ width: `${Math.min(Math.max(goal.percent, 0), 100)}%` }}
                    />
                  </div>
                  <p className="text-texto-fraco text-xs">
                    <Amount
                      cents={goal.savedCents}
                      size="xs"
                      tone="neutro"
                      sign="never"
                      masked={valuesHidden}
                    />
                    {" de "}
                    <Amount
                      cents={goal.targetCents}
                      size="xs"
                      tone="neutro"
                      sign="never"
                      masked={valuesHidden}
                    />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

type FlowCardProps = {
  label: string;
  variation: Variation;
  tone: "entrada" | "saida";
  masked: boolean;
  /** Em despesa, subir é ruim: o tom da variação inverte. */
  inverted?: boolean;
  footer?: ReactNode;
};

function FlowCard({ label, variation, tone, masked, inverted = false, footer }: FlowCardProps) {
  const worse = inverted ? variation.deltaCents > 0 : variation.deltaCents < 0;
  const variationTone =
    variation.deltaCents === 0 ? "text-texto-fraco" : worse ? "text-alerta" : "text-entrada";

  return (
    <Card title={label}>
      <Amount cents={variation.currentCents} size="lg" tone={tone} sign="never" masked={masked} />
      <p className="mt-1 text-xs">
        {variation.percent === null ? (
          <span className="text-texto-fraco">Sem base de comparação.</span>
        ) : (
          <>
            <span className={`valor ${variationTone}`}>
              {masked ? "••" : formatPercent(variation.percent)}
            </span>{" "}
            <span className="text-texto-fraco">contra o período anterior</span>
          </>
        )}
      </p>
      {footer && <p className="text-texto-fraco mt-1 text-xs">{footer}</p>}
    </Card>
  );
}

function formatPercent(value: number): string {
  const formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  return `${value > 0 ? "+" : ""}${formatted}%`;
}

function formatShort(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (typeof value === "string") params.set(key, value);
  }

  return params;
}
