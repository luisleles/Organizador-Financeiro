"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCentsForInput } from "@/lib/money";
import {
  FILTER_PARAMS,
  countActiveFilters,
  type TransactionFilters,
} from "@/server/transactions/transaction.filters";
import type { FilterOptions } from "@/server/transactions/transaction.types";

const TYPE_LABELS = [
  { value: "", label: "Todos os tipos" },
  { value: "EXPENSE", label: "Só despesas" },
  { value: "INCOME", label: "Só receitas" },
  { value: "TRANSFER", label: "Só transferências" },
];

type TransactionFiltersFormProps = {
  filters: TransactionFilters;
  options: FilterOptions;
  /** Parâmetros do período, que o formulário precisa reenviar para não perder o recorte. */
  periodParams: [string, string][];
  clearHref: string;
};

/**
 * Um `<form method="get">`: o navegador monta a URL com todos os filtros, inclusive as
 * listas de checkbox, e sem JavaScript ele já funciona. Como o estado da tela é a própria
 * URL, o botão voltar e um link colado funcionam de graça.
 *
 * O único JavaScript aqui é cosmético: desligar os campos vazios antes de enviar, para o
 * endereço não sair cheio de `tipo=&min=&max=`. Sem script, o filtro continua valendo — a
 * URL só fica mais feia.
 */
export function TransactionFiltersForm({
  filters,
  options,
  periodParams,
  clearHref,
}: TransactionFiltersFormProps) {
  const activeCount = countActiveFilters(filters);

  function dropEmptyFields(event: FormEvent<HTMLFormElement>) {
    for (const element of event.currentTarget.elements) {
      const isEmptyText =
        element instanceof HTMLInputElement && element.type === "search" && element.value === "";
      const isEmptyMoney =
        element instanceof HTMLInputElement && element.type === "text" && element.value === "";
      const isDefaultChoice =
        element instanceof HTMLSelectElement &&
        (element.value === "" ||
          (element.name === FILTER_PARAMS.sort && element.value === "data") ||
          (element.name === FILTER_PARAMS.direction && element.value === "desc"));

      if (isEmptyText || isEmptyMoney || isDefaultChoice) element.disabled = true;
    }
  }

  return (
    <form
      method="get"
      action="/transacoes"
      onSubmit={dropEmptyFields}
      className="flex flex-col gap-4"
    >
      {periodParams.map(([key, value]) => (
        <input key={`${key}-${value}`} type="hidden" name={key} value={value} />
      ))}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-texto-fraco font-semibold uppercase">Buscar</span>
          <Input
            name={FILTER_PARAMS.search}
            defaultValue={filters.search}
            placeholder="Descrição ou observação"
            type="search"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-texto-fraco font-semibold uppercase">Tipo</span>
          <Select name={FILTER_PARAMS.type} defaultValue={filters.type ?? ""}>
            {TYPE_LABELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-texto-fraco font-semibold uppercase">Valor mínimo</span>
          <Input
            name={FILTER_PARAMS.min}
            numeric
            prefix="R$"
            inputMode="decimal"
            defaultValue={filters.minCents === null ? "" : formatCentsForInput(filters.minCents)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-2xs text-texto-fraco font-semibold uppercase">Valor máximo</span>
          <Input
            name={FILTER_PARAMS.max}
            numeric
            prefix="R$"
            inputMode="decimal"
            defaultValue={filters.maxCents === null ? "" : formatCentsForInput(filters.maxCents)}
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <CheckboxGroup
          legend="Contas"
          name={FILTER_PARAMS.account}
          selected={filters.accountIds}
          items={options.accounts}
        />
        <CheckboxGroup
          legend="Categorias"
          name={FILTER_PARAMS.category}
          selected={filters.categoryIds}
          items={options.categories}
        />
        <CheckboxGroup
          legend="Etiquetas"
          name={FILTER_PARAMS.tag}
          selected={filters.tagIds}
          items={options.tags}
        />
      </div>

      <div className="border-linha flex flex-wrap items-end justify-between gap-3 border-t pt-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs text-texto-fraco font-semibold uppercase">Ordenar por</span>
            <Select name={FILTER_PARAMS.sort} defaultValue={filters.sort} className="h-9 w-36">
              <option value="data">Data</option>
              <option value="valor">Valor</option>
            </Select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-2xs text-texto-fraco font-semibold uppercase">Direção</span>
            <Select
              name={FILTER_PARAMS.direction}
              defaultValue={filters.direction}
              className="h-9 w-40"
            >
              <option value="desc">Maior primeiro</option>
              <option value="asc">Menor primeiro</option>
            </Select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Link href={clearHref} className="text-texto-fraco hover:text-texto text-xs">
              Limpar {activeCount} {activeCount === 1 ? "filtro" : "filtros"}
            </Link>
          )}
          <Button type="submit" variant="primary">
            Aplicar
          </Button>
        </div>
      </div>
    </form>
  );
}

type CheckboxGroupProps = {
  legend: string;
  name: string;
  selected: readonly string[];
  items: readonly { id: string; name: string }[];
};

function CheckboxGroup({ legend, name, selected, items }: CheckboxGroupProps) {
  return (
    <details open={selected.length > 0} className="border-linha rounded-md border">
      <summary className="text-2xs text-texto-fraco cursor-pointer px-3 py-2 font-semibold uppercase">
        {legend}
        {selected.length > 0 && <span className="valor text-texto"> · {selected.length}</span>}
      </summary>
      <div className="border-linha flex max-h-44 flex-col gap-1 overflow-y-auto border-t px-3 py-2">
        {items.map((item) => (
          <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm sm:min-h-0">
            <input
              type="checkbox"
              name={name}
              value={item.id}
              defaultChecked={selected.includes(item.id)}
              className="accent-foco size-5 sm:size-4"
            />
            {item.name}
          </label>
        ))}
      </div>
    </details>
  );
}
