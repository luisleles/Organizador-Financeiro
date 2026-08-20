"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createBucketAction,
  depositAction,
  redeemGoalAction,
  registerYieldAction,
  withdrawAction,
} from "@/app/(app)/metas/actions";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/date";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { GoalDetail } from "@/server/goals/goal.types";

type AccountOption = { id: string; name: string };

function useNotifiedAction(
  action: (state: ActionState, formData: FormData) => Promise<ActionState>,
  onSuccess?: () => void,
) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onSuccess?.();
    }
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify, onSuccess]);

  return { submit, pending };
}

/** Meta sem caixinha: o progresso é zero até o dinheiro existir de verdade em algum lugar. */
export function CreateBucketPanel({
  goalId,
  accounts,
}: {
  goalId: string;
  accounts: readonly AccountOption[];
}) {
  const { submit, pending } = useNotifiedAction(createBucketAction);

  return (
    <div className="border-linha bg-fundo flex flex-col gap-3 rounded-md border border-dashed p-4">
      <p className="text-texto-fraco text-sm">
        Esta meta ainda está no planejamento. Crie a caixinha para começar a guardar de verdade: ela
        vira uma subconta da conta que você escolher, e cada aporte é uma transferência real.
      </p>
      <form action={submit} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="goalId" value={goalId} />
        <Select
          name="parentAccountId"
          aria-label="Conta mãe"
          defaultValue=""
          className="w-56"
          required
        >
          <option value="">Conta mãe…</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Criando…" : "Criar caixinha"}
        </Button>
      </form>
    </div>
  );
}

export function BucketPanel({ goal, today }: { goal: GoalDetail; today: string }) {
  const [panel, setPanel] = useState<"aporte" | "resgate" | "rendimento" | null>(null);
  const bucket = goal.bucket;
  if (!bucket) return null;

  return (
    <div className="border-linha flex flex-col gap-3 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs text-texto-fraco font-semibold uppercase">
          Caixinha em {bucket.parentAccountName}
        </span>
        {bucket.archived && <Badge tone="previsto">arquivada</Badge>}

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {!bucket.archived && (
            <>
              <Button size="sm" onClick={() => setPanel(panel === "aporte" ? null : "aporte")}>
                Aportar
              </Button>
              <Button size="sm" onClick={() => setPanel(panel === "resgate" ? null : "resgate")}>
                Resgatar
              </Button>
              <Button
                size="sm"
                onClick={() => setPanel(panel === "rendimento" ? null : "rendimento")}
              >
                Rendimento
              </Button>
              <RedeemButton goalId={goal.id} today={today} balanceCents={bucket.balanceCents} />
            </>
          )}
        </div>
      </div>

      {panel === "aporte" && (
        <MovementForm
          action={depositAction}
          goalId={goal.id}
          today={today}
          label="Aportar"
          hint={`Sai de ${bucket.parentAccountName} e entra na caixinha. O patrimônio não muda.`}
        />
      )}
      {panel === "resgate" && (
        <MovementForm
          action={withdrawAction}
          goalId={goal.id}
          today={today}
          label="Resgatar"
          hint={`Volta para ${bucket.parentAccountName}. O patrimônio não muda.`}
        />
      )}
      {panel === "rendimento" && <YieldForm goalId={goal.id} today={today} />}

      {goal.movements.length > 0 && (
        <ul className="flex flex-col gap-1">
          {goal.movements.slice(0, panel ? goal.movements.length : 4).map((movement) => (
            <li
              key={movement.id}
              className="border-linha flex items-center gap-3 border-b pb-1 text-xs last:border-b-0"
            >
              <span className="valor text-num-xs text-texto-fraco">
                {formatDate(movement.date)}
              </span>
              <Badge tone={movement.kind === "rendimento" ? "entrada" : "neutro"}>
                {movement.kind}
              </Badge>
              <span className="ml-auto">
                <Amount cents={movement.amountCents} size="xs" />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MovementForm({
  action,
  goalId,
  today,
  label,
  hint,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  goalId: string;
  today: string;
  label: string;
  hint: string;
}) {
  const { submit, pending } = useNotifiedAction(action);

  return (
    <form action={submit} className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="goalId" value={goalId} />
        <Input
          name="date"
          type="date"
          aria-label="Data"
          defaultValue={today}
          className="h-9 w-40 text-sm"
          required
        />
        <Input
          name="amountCents"
          aria-label="Valor"
          numeric
          prefix="R$"
          inputMode="decimal"
          placeholder="0,00"
          className="h-9 w-32 text-sm"
          required
        />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Salvando…" : label}
        </Button>
      </div>
      <p className="text-texto-fraco text-xs">{hint}</p>
    </form>
  );
}

/** Rendimento em lote: uma linha por mês, para lançar o extrato da poupança de uma vez. */
function YieldForm({ goalId, today }: { goalId: string; today: string }) {
  const { submit, pending } = useNotifiedAction(registerYieldAction);
  const [rows, setRows] = useState(1);
  const currentMonth = today.slice(0, 7);

  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="goalId" value={goalId} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            name="month"
            type="month"
            aria-label={`Mês do rendimento ${index + 1}`}
            defaultValue={shiftMonth(currentMonth, -index)}
            className="h-9 w-40 text-sm"
          />
          <Input
            name="amount"
            aria-label={`Valor do rendimento ${index + 1}`}
            numeric
            prefix="R$"
            inputMode="decimal"
            placeholder="0,00"
            className="h-9 w-32 text-sm"
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setRows(rows + 1)}>
          + outro mês
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending ? "Salvando…" : "Lançar rendimento"}
        </Button>
      </div>
      <p className="text-texto-fraco text-xs">
        Rendimento é dinheiro novo: entra na caixinha sem sair de lugar nenhum, aumenta o patrimônio
        e aparece como receita nos relatórios — separado da receita ativa.
      </p>
    </form>
  );
}

function RedeemButton({
  goalId,
  today,
  balanceCents,
}: {
  goalId: string;
  today: string;
  balanceCents: number;
}) {
  const [open, setOpen] = useState(false);
  const { submit, pending } = useNotifiedAction(redeemGoalAction, () => setOpen(false));

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={balanceCents <= 0}
      >
        Concluir
      </Button>
      <Modal
        open={open}
        title="Resgatar e concluir"
        description="Todo o saldo volta para a conta mãe e a caixinha é arquivada. O histórico fica preservado."
        onClose={() => setOpen(false)}
        footer={
          <form action={submit} className="flex gap-2">
            <input type="hidden" name="goalId" value={goalId} />
            <input type="hidden" name="date" value={today} />
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Resgatando…" : "Resgatar tudo"}
            </Button>
          </form>
        }
      >
        <p className="text-texto-fraco">
          Voltam <Amount cents={balanceCents} size="sm" tone="entrada" sign="never" /> para a conta
          mãe.
        </p>
      </Modal>
    </>
  );
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}
