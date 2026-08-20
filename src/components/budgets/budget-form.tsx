"use client";

import { useActionState, useEffect } from "react";
import { removeBudgetAction, setBudgetAction } from "@/app/(app)/orcamentos/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCentsForInput } from "@/lib/money";
import { IDLE_ACTION_STATE } from "@/server/action-state";

type BudgetFormProps = {
  month: string;
  categories: readonly { id: string; name: string }[];
};

/** Define ou atualiza um limite. O mesmo formulário serve para criar e para corrigir. */
export function BudgetForm({ month, categories }: BudgetFormProps) {
  const [state, submit, pending] = useActionState(setBudgetAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  if (categories.length === 0) {
    return (
      <p className="text-texto-fraco text-sm">
        Todas as categorias de despesa já têm limite neste mês.
      </p>
    );
  }

  const limitError = state.status === "error" ? state.fieldErrors?.limitCents?.[0] : undefined;

  return (
    <form action={submit} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="month" value={month} />

      <Select name="categoryId" aria-label="Categoria" defaultValue="" className="w-56" required>
        <option value="">Categoria…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      <div className="flex flex-col gap-1">
        <Input
          name="limitCents"
          aria-label="Limite do mês"
          numeric
          prefix="R$"
          inputMode="decimal"
          placeholder="0,00"
          className="w-36"
          invalid={Boolean(limitError)}
          required
        />
        {limitError && <p className="text-alerta text-xs">{limitError}</p>}
      </div>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Salvando…" : "Definir limite"}
      </Button>
    </form>
  );
}

type EditBudgetProps = {
  month: string;
  categoryId: string;
  limitCents: number;
};

export function EditBudget({ month, categoryId, limitCents }: EditBudgetProps) {
  const [state, submit, pending] = useActionState(setBudgetAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit} className="flex items-center gap-1.5">
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <Input
        name="limitCents"
        aria-label="Novo limite"
        numeric
        prefix="R$"
        inputMode="decimal"
        defaultValue={formatCentsForInput(limitCents)}
        className="h-8 w-32 text-sm"
      />
      <Button type="submit" size="sm" disabled={pending}>
        Salvar
      </Button>
    </form>
  );
}

export function RemoveBudget({ month, categoryId }: { month: string; categoryId: string }) {
  const [state, submit, pending] = useActionState(removeBudgetAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message);
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="categoryId" value={categoryId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        Remover
      </Button>
    </form>
  );
}
