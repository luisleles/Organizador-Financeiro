"use client";

import { useActionState, useEffect, useState } from "react";
import { addContributionAction, removeContributionAction } from "@/app/(app)/metas/actions";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/date";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import type { GoalContributionRow } from "@/server/goals/goal.types";

type ContributionPanelProps = {
  goalId: string;
  contributions: readonly GoalContributionRow[];
  today: string;
  /** Quando a meta segue o saldo da conta, o aporte vira registro e não soma no progresso. */
  informativeOnly: boolean;
};

export function ContributionPanel({
  goalId,
  contributions,
  today,
  informativeOnly,
}: ContributionPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-linha flex flex-col gap-3 border-t pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-2xs text-texto-fraco font-semibold uppercase">
          Aportes ({contributions.length})
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Fechar" : "Registrar aporte"}
        </Button>
      </div>

      {open && (
        <>
          <ContributionForm goalId={goalId} today={today} />
          {informativeOnly && (
            <p className="text-texto-fraco text-xs">
              Esta meta acompanha o saldo da conta vinculada, então o aporte fica registrado no
              histórico mas não muda o progresso.
            </p>
          )}
        </>
      )}

      {contributions.length > 0 && (
        <ul className="flex flex-col gap-1">
          {contributions.slice(0, open ? contributions.length : 3).map((contribution) => (
            <li
              key={contribution.id}
              className="border-linha flex items-center gap-3 border-b pb-1 text-xs last:border-b-0"
            >
              <span className="valor text-num-xs text-texto-fraco">
                {formatDate(contribution.date)}
              </span>
              {contribution.note && <span className="text-texto-fraco">{contribution.note}</span>}
              <span className="ml-auto flex items-center gap-2">
                <Amount cents={contribution.amountCents} size="xs" />
                {open && <RemoveContribution contributionId={contribution.id} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ContributionForm({ goalId, today }: { goalId: string; today: string }) {
  const [state, submit, pending] = useActionState(addContributionAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  const amountError = state.status === "error" ? state.fieldErrors?.amountCents?.[0] : undefined;

  return (
    <form action={submit} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="goalId" value={goalId} />

      <Input
        name="date"
        type="date"
        aria-label="Data do aporte"
        defaultValue={today}
        className="h-9 w-40 text-sm"
        required
      />
      <div className="flex flex-col gap-1">
        <Input
          name="amountCents"
          aria-label="Valor do aporte"
          numeric
          prefix="R$"
          inputMode="decimal"
          placeholder="0,00"
          className="h-9 w-32 text-sm"
          invalid={Boolean(amountError)}
          required
        />
        {amountError && <p className="text-alerta text-xs">{amountError}</p>}
      </div>
      <Input
        name="note"
        aria-label="Observação"
        placeholder="Opcional"
        className="h-9 flex-1 text-sm"
      />
      <Button type="submit" variant="primary" size="sm" disabled={pending}>
        {pending ? "Salvando…" : "Adicionar"}
      </Button>
    </form>
  );
}

function RemoveContribution({ contributionId }: { contributionId: string }) {
  const [state, submit, pending] = useActionState(removeContributionAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message);
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="contributionId" value={contributionId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        ✕
      </Button>
    </form>
  );
}
