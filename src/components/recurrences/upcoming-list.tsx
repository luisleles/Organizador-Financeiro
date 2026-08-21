"use client";

import { useActionState, useEffect, useState } from "react";
import {
  confirmOccurrenceAction,
  setOccurrenceAmountAction,
  skipOccurrenceAction,
} from "@/app/(app)/recorrencias/actions";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/date";
import { formatCentsForInput } from "@/lib/money";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { UpcomingOccurrence } from "@/server/recurrences/recurrence.types";

type UpcomingListProps = {
  occurrences: readonly UpcomingOccurrence[];
  valuesHidden: boolean;
};

export function UpcomingList({ occurrences, valuesHidden }: UpcomingListProps) {
  if (occurrences.length === 0) {
    return (
      <p className="text-texto-fraco text-sm">
        Nada previsto para os próximos 30 dias. Cadastre uma recorrência para o app lançar sozinho.
      </p>
    );
  }

  return (
    <ul className="flex flex-col">
      {occurrences.map((occurrence) => (
        <UpcomingRow
          key={`${occurrence.ruleId}-${occurrence.dateKey}`}
          occurrence={occurrence}
          valuesHidden={valuesHidden}
        />
      ))}
    </ul>
  );
}

function UpcomingRow({
  occurrence,
  valuesHidden,
}: {
  occurrence: UpcomingOccurrence;
  valuesHidden: boolean;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="border-linha flex flex-wrap items-center gap-x-3 gap-y-2 border-b py-2 last:border-b-0">
      <span className="valor text-num-xs text-texto-fraco w-16 shrink-0">
        {formatDate(occurrence.date).slice(0, 5)}
      </span>

      <span className="flex min-w-0 flex-col">
        <span
          className={cn(
            "text-texto truncate text-sm",
            occurrence.skipped && "text-texto-fraco line-through",
          )}
        >
          {occurrence.description}
        </span>
        <span className="text-texto-fraco truncate text-xs">
          {occurrence.accountName}
          {occurrence.categoryName ? ` · ${occurrence.categoryName}` : ""}
        </span>
      </span>

      {occurrence.skipped && <Badge tone="previsto">pulada</Badge>}
      {occurrence.edited && !occurrence.skipped && <Badge tone="previsto">valor ajustado</Badge>}
      {occurrence.isCreditCard && <Badge tone="previsto">cartão</Badge>}

      <span className="ml-auto flex items-center gap-2">
        <Amount
          cents={occurrence.type === "INCOME" ? occurrence.amountCents : -occurrence.amountCents}
          size="xs"
          tone={occurrence.type === "INCOME" ? "entrada" : "saida"}
          sign="always"
          masked={valuesHidden}
        />

        {editing ? (
          <AmountForm occurrence={occurrence} onDone={() => setEditing(false)} />
        ) : (
          <span className="flex items-center gap-1">
            {!occurrence.skipped && (
              <>
                <OccurrenceButton
                  occurrence={occurrence}
                  action={confirmOccurrenceAction}
                  label="Confirmar"
                  title="Lançar agora, sem esperar o dia"
                />
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                  Valor
                </Button>
              </>
            )}
            <OccurrenceButton
              occurrence={occurrence}
              action={skipOccurrenceAction}
              label={occurrence.skipped ? "Desfazer" : "Pular"}
              title={
                occurrence.skipped
                  ? "Voltar a lançar nesta data"
                  : "Não lançar só nesta data; a regra continua"
              }
              restore={occurrence.skipped}
            />
          </span>
        )}
      </span>
    </li>
  );
}

type OccurrenceAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

function OccurrenceButton({
  occurrence,
  action,
  label,
  title,
  restore = false,
}: {
  occurrence: UpcomingOccurrence;
  action: OccurrenceAction;
  label: string;
  title: string;
  restore?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="ruleId" value={occurrence.ruleId} />
      <input type="hidden" name="date" value={occurrence.dateKey} />
      {restore && <input type="hidden" name="restore" value="true" />}
      <Button type="submit" variant="ghost" size="sm" title={title} disabled={pending}>
        {label}
      </Button>
    </form>
  );
}

function AmountForm({
  occurrence,
  onDone,
}: {
  occurrence: UpcomingOccurrence;
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(setOccurrenceAmountAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onDone();
    }
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify, onDone]);

  return (
    <form action={submit} className="flex items-center gap-1">
      <input type="hidden" name="ruleId" value={occurrence.ruleId} />
      <input type="hidden" name="date" value={occurrence.dateKey} />
      <Input
        name="amountCents"
        numeric
        prefix="R$"
        inputMode="decimal"
        aria-label={`Valor de ${occurrence.description} em ${formatDate(occurrence.date)}`}
        defaultValue={formatCentsForInput(occurrence.amountCents)}
        className="w-32"
        autoFocus
      />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Salvar
      </Button>
      <Button variant="ghost" size="sm" onClick={onDone} disabled={pending}>
        Cancelar
      </Button>
    </form>
  );
}
