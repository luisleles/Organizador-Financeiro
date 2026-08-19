import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { TransactionFiltersForm } from "@/components/transactions/transaction-filters-form";
import { TransactionPagination } from "@/components/transactions/transaction-pagination";
import { TransactionsWorkspace } from "@/components/transactions/transactions-workspace";
import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import { toDateParts } from "@/lib/date";
import { FROM_PARAM, PERIOD_PARAM, TO_PARAM, parsePeriod, resolvePeriod } from "@/lib/period";
import { FILTER_PARAMS, parseFilters } from "@/server/transactions/transaction.filters";
import {
  listDescriptionSuggestions,
  listFilterOptions,
  listTransactions,
} from "@/server/transactions/transaction.service";

type TransacoesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TransacoesPage({ searchParams }: TransacoesPageProps) {
  const params = toSearchParams(await searchParams);
  const period = parsePeriod(params);
  const resolved = resolvePeriod(period);
  const filters = parseFilters(params);

  const [listing, options, suggestions] = await Promise.all([
    listTransactions(resolved, filters),
    listFilterOptions(),
    listDescriptionSuggestions(),
  ]);

  const periodParams = [PERIOD_PARAM, FROM_PARAM, TO_PARAM]
    .map((key) => [key, params.get(key)] as const)
    .filter((entry): entry is [string, string] => entry[1] !== null);

  const baseParams = new URLSearchParams(params);
  baseParams.delete(FILTER_PARAMS.page);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transações"
        description={`Extrato de ${resolved.label}. Todo filtro fica na URL, então este endereço abre exatamente esta tela.`}
      />

      <Card title="Resumo do recorte">
        <dl className="flex flex-wrap gap-x-10 gap-y-3">
          <Figure label="Entradas">
            <Amount cents={listing.summary.incomeCents} size="md" tone="entrada" sign="never" />
          </Figure>
          <Figure label="Saídas">
            <Amount cents={listing.summary.expenseCents} size="md" tone="saida" sign="never" />
          </Figure>
          <Figure label="Resultado">
            <Amount
              cents={listing.summary.netCents}
              size="md"
              tone={listing.summary.netCents < 0 ? "alerta" : "neutro"}
              sign="negative"
            />
          </Figure>
          <Figure label="Movido entre contas">
            <Amount cents={listing.summary.transferCents} size="md" tone="previsto" sign="never" />
          </Figure>
        </dl>
      </Card>

      <Card title="Filtros">
        <TransactionFiltersForm
          filters={filters}
          options={options}
          periodParams={periodParams}
          clearHref={`/transacoes${periodParams.length > 0 ? `?${new URLSearchParams(periodParams)}` : ""}`}
        />
      </Card>

      <TransactionsWorkspace
        listing={listing}
        options={options}
        suggestions={suggestions}
        filters={filters}
        today={todayISO()}
      />

      <TransactionPagination
        page={listing.page}
        pageCount={listing.pageCount}
        totalCount={listing.totalCount}
        baseParams={baseParams}
      />
    </div>
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

function toSearchParams(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(record)) {
    if (Array.isArray(value)) for (const item of value) params.append(key, item);
    else if (typeof value === "string") params.set(key, value);
  }

  return params;
}

function todayISO(): string {
  const { year, month, day } = toDateParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
