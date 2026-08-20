"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { FilterOptions } from "@/server/transactions/transaction.types";
import {
  categorizeTransactionsAction,
  deleteTransactionsAction,
  tagTransactionsAction,
} from "@/app/(app)/transacoes/actions";

type BulkActionsBarProps = {
  selectedIds: readonly string[];
  options: FilterOptions;
  onDone: () => void;
};

export function BulkActionsBar({ selectedIds, options, onDone }: BulkActionsBarProps) {
  if (selectedIds.length === 0) return null;

  return (
    <div className="border-linha bg-superficie-alta shadow-elevado sticky bottom-24 z-20 flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 md:bottom-6">
      <p className="text-sm font-medium">
        <span className="valor">{selectedIds.length}</span> selecionados
      </p>

      <CategorizeForm ids={selectedIds} options={options} onDone={onDone} />
      <TagForm ids={selectedIds} options={options} onDone={onDone} />
      <DeleteButton ids={selectedIds} onDone={onDone} />

      <Button variant="ghost" size="sm" onClick={onDone} className="ml-auto">
        Limpar seleção
      </Button>
    </div>
  );
}

function useBulkAction(
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
  onDone: () => void,
) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message);
      onDone();
    }
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify, onDone]);

  return { submit, pending };
}

function HiddenIds({ ids }: { ids: readonly string[] }) {
  return (
    <>
      {ids.map((id) => (
        <input key={id} type="hidden" name="ids" value={id} />
      ))}
    </>
  );
}

function CategorizeForm({
  ids,
  options,
  onDone,
}: {
  ids: readonly string[];
  options: FilterOptions;
  onDone: () => void;
}) {
  const { submit, pending } = useBulkAction(categorizeTransactionsAction, onDone);

  return (
    <form action={submit} className="flex items-center gap-1.5">
      <HiddenIds ids={ids} />
      <Select name="categoryId" aria-label="Categoria em lote" className="h-8 w-44 text-sm">
        <option value="">Categorizar como…</option>
        {options.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" disabled={pending}>
        Aplicar
      </Button>
    </form>
  );
}

function TagForm({
  ids,
  options,
  onDone,
}: {
  ids: readonly string[];
  options: FilterOptions;
  onDone: () => void;
}) {
  const { submit, pending } = useBulkAction(tagTransactionsAction, onDone);

  return (
    <form action={submit} className="flex items-center gap-1.5">
      <HiddenIds ids={ids} />
      <Select name="tagId" aria-label="Etiqueta em lote" className="h-8 w-40 text-sm">
        <option value="">Etiquetar com…</option>
        {options.tags.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </Select>
      <Button type="submit" size="sm" disabled={pending}>
        Aplicar
      </Button>
    </form>
  );
}

function DeleteButton({ ids, onDone }: { ids: readonly string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const { submit, pending } = useBulkAction(deleteTransactionsAction, () => {
    setOpen(false);
    onDone();
  });

  return (
    <>
      <Button variant="danger" size="sm" onClick={() => setOpen(true)}>
        Excluir
      </Button>

      <Modal
        open={open}
        title={`Excluir ${ids.length} lançamentos`}
        description="Se algum deles for uma transferência, a outra perna vai junto."
        onClose={() => setOpen(false)}
        footer={
          <form action={submit} className="flex gap-2">
            <HiddenIds ids={ids} />
            <Select name="installmentScope" aria-label="Escopo das parcelas" defaultValue="SINGLE">
              <option value="SINGLE">Só estas</option>
              <option value="FUTURE">Estas e futuras</option>
            </Select>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Excluindo…" : "Excluir"}
            </Button>
          </form>
        }
      >
        <p className="text-texto-fraco">Esta ação não pode ser desfeita.</p>
      </Modal>
    </>
  );
}
