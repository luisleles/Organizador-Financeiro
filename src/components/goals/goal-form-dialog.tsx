"use client";

import { useActionState, useCallback, useEffect, useId, useState } from "react";
import { createGoalAction, updateGoalAction } from "@/app/(app)/metas/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatCentsForInput } from "@/lib/money";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import { GOAL_COLORS, GOAL_ICONS } from "@/server/goals/goal.schema";
import type { GoalDetail } from "@/server/goals/goal.types";
import { GoalIcon } from "./goal-icon";

type AccountOption = { id: string; name: string };

type GoalFormDialogProps = {
  goal?: GoalDetail;
  accounts: readonly AccountOption[];
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function GoalFormDialog({
  goal,
  accounts,
  label,
  variant = "secondary",
  size = "md",
}: GoalFormDialogProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        title={goal ? `Editar ${goal.name}` : "Nova meta"}
        description={
          goal ? undefined : "O prazo é o que define quanto você precisa guardar por mês."
        }
        onClose={close}
      >
        {open && <GoalForm goal={goal} accounts={accounts} onDone={close} />}
      </Modal>
    </>
  );
}

function GoalForm({
  goal,
  accounts,
  onDone,
}: {
  goal?: GoalDetail;
  accounts: readonly AccountOption[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(
    goal ? updateGoalAction : createGoalAction,
    IDLE_ACTION_STATE,
  );
  const fieldId = useId();
  const { notify } = useToast();
  const [linked, setLinked] = useState(goal?.accountId ?? "");

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onDone();
    }
  }, [state, notify, onDone]);

  const submitted = state.status === "error" ? state.values : undefined;
  const initial = {
    name: goal?.name ?? "",
    targetCents: goal ? formatCentsForInput(goal.pace.targetCents) : "",
    targetDate: goal ? toISODate(goal.targetDate) : "",
    color: goal?.color ?? GOAL_COLORS[0],
    icon: goal?.icon ?? GOAL_ICONS[0],
    accountId: goal?.accountId ?? "",
  };
  const valueOf = (field: keyof typeof initial) => submitted?.[field] ?? initial[field];
  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  return (
    <form action={submit} className="flex flex-col gap-4">
      {goal && <input type="hidden" name="goalId" value={goal.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={id("name")} error={errorFor("name")}>
          <Input
            id={id("name")}
            name="name"
            defaultValue={valueOf("name")}
            placeholder="Reserva de emergência"
            invalid={Boolean(errorFor("name"))}
            required
          />
        </Field>

        <Field label="Valor alvo" htmlFor={id("targetCents")} error={errorFor("targetCents")}>
          <Input
            id={id("targetCents")}
            name="targetCents"
            numeric
            prefix="R$"
            inputMode="decimal"
            defaultValue={valueOf("targetCents")}
            invalid={Boolean(errorFor("targetCents"))}
            required
          />
        </Field>

        <Field label="Prazo" htmlFor={id("targetDate")} error={errorFor("targetDate")}>
          <Input
            id={id("targetDate")}
            name="targetDate"
            type="date"
            defaultValue={valueOf("targetDate")}
            required
          />
        </Field>

        <Field
          label="Conta vinculada"
          htmlFor={id("accountId")}
          error={errorFor("accountId")}
          hint="Opcional."
        >
          <Select
            key={valueOf("accountId")}
            id={id("accountId")}
            name="accountId"
            defaultValue={valueOf("accountId")}
            onChange={(event) => setLinked(event.target.value)}
          >
            <option value="">Nenhuma</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <label
        className={cn(
          "border-linha flex items-start gap-3 rounded-md border p-3 text-sm",
          !linked && "opacity-50",
        )}
      >
        <input
          type="checkbox"
          name="useAccountBalance"
          defaultChecked={goal?.useAccountBalance ?? false}
          disabled={!linked}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-texto font-medium">Usar o saldo da conta como progresso</span>
          <span className="text-texto-fraco text-xs">
            O progresso passa a ser o saldo atual da conta, e o ritmo vem da variação dele. Os
            aportes manuais continuam registrados, mas deixam de somar.
          </span>
        </span>
      </label>
      {errorFor("useAccountBalance") && (
        <p className="text-alerta text-xs">{errorFor("useAccountBalance")}</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-2xs text-texto-fraco font-semibold uppercase">Ícone</legend>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {GOAL_ICONS.map((icon) => (
              <label key={icon} className="cursor-pointer">
                <input
                  type="radio"
                  name="icon"
                  value={icon}
                  defaultChecked={icon === valueOf("icon")}
                  className="peer sr-only"
                />
                <span className="border-linha text-texto-fraco peer-checked:border-tinta peer-checked:text-texto peer-focus-visible:outline-foco flex size-8 items-center justify-center rounded-md border peer-focus-visible:outline-2">
                  <GoalIcon icon={icon} className="size-4" />
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-2xs text-texto-fraco font-semibold uppercase">Cor</legend>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {GOAL_COLORS.map((color) => (
              <label key={color} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={color}
                  defaultChecked={color === valueOf("color")}
                  className="peer sr-only"
                />
                <span
                  aria-label={`Cor ${color}`}
                  style={{ backgroundColor: color }}
                  className="ring-offset-superficie peer-checked:ring-texto peer-focus-visible:ring-foco block size-6 rounded-full ring-offset-2 peer-checked:ring-2 peer-focus-visible:ring-2"
                />
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {state.status === "error" && (
        <p role="alert" className="text-alerta text-sm">
          {state.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando…" : goal ? "Salvar" : "Criar meta"}
        </Button>
      </div>
    </form>
  );
}

function toISODate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
}
