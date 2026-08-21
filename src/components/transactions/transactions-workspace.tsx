"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createTransactionAction,
  createTransferAction,
  loadTransferAction,
  updateTransactionAction,
  updateTransferAction,
} from "@/app/(app)/transacoes/actions";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { toISODate } from "@/lib/date";
import { Table, TableCell, TableGroupRow, TableHeadCell } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { formatCentsForInput } from "@/lib/money";
import { groupByDay, type TransactionFilters } from "@/server/transactions/transaction.filters";
import type {
  FilterOptions,
  TransactionListing,
  TransactionRow,
} from "@/server/transactions/transaction.types";
import type { DescriptionSuggestion } from "@/server/transactions/transaction.types";
import { BulkActionsBar } from "./bulk-actions-bar";
import { TransactionForm, type TransactionDefaults } from "./transaction-form";
import { TransferForm, type TransferDefaults } from "./transfer-form";

type Dialog =
  | { kind: "new-transaction" }
  | { kind: "edit-transaction"; row: TransactionRow }
  | { kind: "new-transfer" }
  | { kind: "edit-transfer"; groupId: string; defaults: TransferDefaults };

type TransactionsWorkspaceProps = {
  listing: TransactionListing;
  options: FilterOptions;
  suggestions: DescriptionSuggestion[];
  filters: TransactionFilters;
  today: string;
};

export function TransactionsWorkspace({
  listing,
  options,
  suggestions,
  filters,
  today,
}: TransactionsWorkspaceProps) {
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [formKey, setFormKey] = useState(0);
  const [sticky, setSticky] = useState<TransactionDefaults>(() => emptyDefaults(today, options));
  const { notify } = useToast();

  const closeDialog = useCallback(() => setDialog(null), []);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // `N` abre o lançamento rápido, desde que o foco não esteja num campo de texto.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "n" && event.key !== "N") return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      setDialog({ kind: "new-transaction" });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleSaved = useCallback(
    (message: string, nextSticky: TransactionDefaults) => {
      notify(message, "entrada");
      setSticky(nextSticky);
      setFormKey((key) => key + 1);
    },
    [notify],
  );

  async function openTransfer(row: TransactionRow) {
    if (!row.transferGroupId) return;

    const transfer = await loadTransferAction(row.transferGroupId);
    if (!transfer) {
      notify("Transferência não encontrada.", "alerta");
      return;
    }

    setDialog({
      kind: "edit-transfer",
      groupId: row.transferGroupId,
      defaults: {
        date: transfer.date,
        description: transfer.description,
        amountCents: formatCentsForInput(transfer.amountCents),
        fromAccountId: transfer.fromAccountId,
        toAccountId: transfer.toAccountId,
      },
    });
  }

  const groups = useMemo(
    () => (filters.sort === "data" ? groupByDay(listing.rows) : null),
    [listing.rows, filters.sort],
  );

  const allSelected = listing.rows.length > 0 && selected.size === listing.rows.length;

  function toggleRow(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(listing.rows.map((row) => row.id)));
  }

  /**
   * No celular a tabela vira lista. Seis colunas em 375px ou truncam a descrição — que é o
   * que a pessoa lê para se lembrar do gasto — ou empurram o valor para fora da tela. Em
   * duas linhas cabe tudo, o alvo de toque passa de 56px e não há gesto lateral competindo
   * com o "voltar" do navegador.
   */
  const renderCard = (row: TransactionRow, comData = true) => (
    <li
      key={row.id}
      className={cn("border-linha border-b", selected.has(row.id) && "bg-superficie")}
    >
      <div className="flex items-center gap-3 px-1 py-2.5">
        <label className="flex min-h-11 min-w-11 items-center justify-center">
          <span className="sr-only">Selecionar {row.description}</span>
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={() => toggleRow(row.id)}
            className="accent-foco size-5"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            if (row.invoiceId && row.transferGroupId) return;
            if (row.transferGroupId) void openTransfer(row);
            else setDialog({ kind: "edit-transaction", row });
          }}
          className="flex min-h-11 flex-1 flex-col justify-center gap-0.5 text-left"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-texto text-sm">{row.description}</span>
            <Amount
              cents={row.amountCents}
              size="sm"
              tone={row.type === "TRANSFER" ? "previsto" : "auto"}
            />
          </span>
          <span className="text-texto-fraco flex flex-wrap items-center gap-x-1.5 text-xs">
            {comData && (
              <>
                <span className="valor">{formatDate(row.date)}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <span>
              {row.type === "TRANSFER" ? "transferência" : (row.categoryName ?? "sem categoria")}
            </span>
            <span aria-hidden>·</span>
            <span>{row.accountName}</span>
            {row.tags.map((tag) => (
              <Badge key={tag.id} tone="neutro">
                {tag.name}
              </Badge>
            ))}
          </span>
        </button>
      </div>
    </li>
  );

  const renderRow = (row: TransactionRow) => (
    <tr key={row.id} className={cn("hover:bg-fundo", selected.has(row.id) && "bg-superficie")}>
      <TableCell className="w-10">
        <input
          type="checkbox"
          aria-label={`Selecionar ${row.description}`}
          checked={selected.has(row.id)}
          onChange={() => toggleRow(row.id)}
        />
      </TableCell>
      <TableCell muted className="whitespace-nowrap">
        <span className="valor text-num-xs">{formatDate(row.date)}</span>
      </TableCell>
      <TableCell>
        <button
          type="button"
          onClick={() => {
            if (row.invoiceId && row.transferGroupId) return;
            if (row.transferGroupId) void openTransfer(row);
            else setDialog({ kind: "edit-transaction", row });
          }}
          className="text-texto text-left hover:underline hover:underline-offset-4"
        >
          {row.description}
        </button>
        {row.tags.length > 0 && (
          <span className="ml-2 inline-flex gap-1">
            {row.tags.map((tag) => (
              <Badge key={tag.id} tone="neutro">
                {tag.name}
              </Badge>
            ))}
          </span>
        )}
        {row.invoiceId && row.transferGroupId && <Badge tone="neutro">pagamento de fatura</Badge>}
      </TableCell>
      <TableCell muted className="hidden md:table-cell">
        {row.type === "TRANSFER" ? (
          <Badge tone="previsto">transferência</Badge>
        ) : (
          (row.categoryName ?? "—")
        )}
      </TableCell>
      <TableCell muted className="hidden whitespace-nowrap sm:table-cell">
        {row.accountName}
      </TableCell>
      <TableCell value>
        <Amount cents={row.amountCents} tone={row.type === "TRANSFER" ? "previsto" : "auto"} />
      </TableCell>
    </tr>
  );

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setDialog({ kind: "new-transaction" })}>
          Lançar
        </Button>
        <Button onClick={() => setDialog({ kind: "new-transfer" })}>Transferir</Button>
        <p className="text-texto-fraco text-xs">
          <kbd className="valor">N</kbd> abre o lançamento rápido
        </p>
      </div>

      {listing.rows.length === 0 ? (
        <EmptyState
          title="Nenhum lançamento neste recorte"
          description="Ajuste os filtros ou registre o primeiro lançamento do período."
          action={
            <Button variant="primary" onClick={() => setDialog({ kind: "new-transaction" })}>
              Lançar
            </Button>
          }
        />
      ) : (
        <>
          <div className="sm:hidden">
            {(groups ?? [{ key: "todos", date: null, totalCents: 0, entries: listing.rows }]).map(
              (group) => (
                <section
                  key={group.key}
                  aria-label={group.date ? formatDate(group.date) : undefined}
                >
                  {group.date && (
                    <h3 className="border-linha bg-fundo text-2xs text-texto-fraco sticky top-0 flex items-center justify-between border-b px-1 py-1.5 font-semibold uppercase">
                      <span className="valor">{formatDate(group.date)}</span>
                      <Amount cents={group.totalCents} size="xs" />
                    </h3>
                  )}
                  <ul className="flex flex-col">
                    {group.entries.map((row) => renderCard(row, group.date === null))}
                  </ul>
                </section>
              ),
            )}
          </div>

          <Table caption="Lançamentos do período" className="hidden sm:table">
            <thead>
              <tr>
                <TableHeadCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Selecionar todos"
                    checked={allSelected}
                    onChange={toggleAll}
                  />
                </TableHeadCell>
                <TableHeadCell>Data</TableHeadCell>
                <TableHeadCell>Descrição</TableHeadCell>
                <TableHeadCell className="hidden md:table-cell">Categoria</TableHeadCell>
                <TableHeadCell className="hidden sm:table-cell">Conta</TableHeadCell>
                <TableHeadCell value>Valor</TableHeadCell>
              </tr>
            </thead>
            {groups ? (
              groups.map((group) => (
                <tbody key={group.key}>
                  <TableGroupRow
                    columnSpan={5}
                    label={formatDate(group.date)}
                    total={<Amount cents={group.totalCents} size="sm" />}
                  />
                  {group.entries.map(renderRow)}
                </tbody>
              ))
            ) : (
              <tbody>{listing.rows.map(renderRow)}</tbody>
            )}
          </Table>
        </>
      )}

      <BulkActionsBar selectedIds={[...selected]} options={options} onDone={clearSelection} />

      <Modal
        open={dialog?.kind === "new-transaction"}
        title="Novo lançamento"
        description="Ao salvar, o formulário limpa e volta o foco para a descrição — dá para lançar vários seguidos sem tocar no mouse."
        onClose={closeDialog}
      >
        {dialog?.kind === "new-transaction" && (
          <TransactionForm
            key={formKey}
            action={createTransactionAction}
            defaults={sticky}
            options={options}
            suggestions={suggestions}
            submitLabel="Salvar e continuar"
            onSaved={handleSaved}
            onCancel={closeDialog}
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === "edit-transaction"}
        title="Editar lançamento"
        onClose={closeDialog}
      >
        {dialog?.kind === "edit-transaction" && (
          <TransactionForm
            action={updateTransactionAction}
            defaults={rowToDefaults(dialog.row)}
            options={options}
            suggestions={suggestions}
            transactionId={dialog.row.id}
            submitLabel="Salvar"
            onSaved={(message) => {
              notify(message, "entrada");
              closeDialog();
            }}
            onCancel={closeDialog}
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === "new-transfer"}
        title="Nova transferência"
        onClose={closeDialog}
      >
        {dialog?.kind === "new-transfer" && (
          <TransferForm
            action={createTransferAction}
            defaults={emptyTransfer(today, options)}
            options={options}
            submitLabel="Transferir"
            onSaved={(message) => {
              notify(message, "entrada");
              closeDialog();
            }}
            onCancel={closeDialog}
          />
        )}
      </Modal>

      <Modal
        open={dialog?.kind === "edit-transfer"}
        title="Editar transferência"
        description="As duas pernas mudam juntas."
        onClose={closeDialog}
      >
        {dialog?.kind === "edit-transfer" && (
          <TransferForm
            action={updateTransferAction}
            defaults={dialog.defaults}
            options={options}
            transferGroupId={dialog.groupId}
            submitLabel="Salvar"
            onSaved={(message) => {
              notify(message, "entrada");
              closeDialog();
            }}
            onCancel={closeDialog}
          />
        )}
      </Modal>
    </>
  );
}

function emptyDefaults(today: string, options: FilterOptions): TransactionDefaults {
  return {
    date: today,
    type: "EXPENSE",
    accountId: options.accounts[0]?.id ?? "",
    description: "",
    amountCents: "",
    categoryId: "",
    tagIds: [],
    notes: "",
    installments: "1",
    installmentScope: "SINGLE",
  };
}

function emptyTransfer(today: string, options: FilterOptions): TransferDefaults {
  return {
    date: today,
    description: "",
    amountCents: "",
    fromAccountId: options.transferAccounts[0]?.id ?? "",
    toAccountId: options.transferAccounts[1]?.id ?? options.transferAccounts[0]?.id ?? "",
  };
}

function rowToDefaults(row: TransactionRow): TransactionDefaults {
  return {
    date: toISODate(row.date),
    type: row.amountCents < 0 ? "EXPENSE" : "INCOME",
    accountId: row.accountId,
    description: row.description.replace(/ \(\d+\/\d+\)$/, ""),
    amountCents: formatCentsForInput(Math.abs(row.amountCents)),
    categoryId: row.categoryId ?? "",
    tagIds: row.tags.map((tag) => tag.id),
    notes: row.notes ?? "",
    installments: "1",
    installmentScope: row.installmentGroupId ? "SINGLE" : "",
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("dialog[open]") !== null
  );
}
