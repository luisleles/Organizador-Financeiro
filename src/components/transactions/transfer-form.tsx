"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { FilterOptions } from "@/server/transactions/transaction.types";
import { AmountInput } from "./amount-input";

export type TransferDefaults = {
  date: string;
  description: string;
  amountCents: string;
  fromAccountId: string;
  toAccountId: string;
};

type TransferFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: TransferDefaults;
  options: FilterOptions;
  transferGroupId?: string;
  submitLabel: string;
  onSaved: (message: string) => void;
  onCancel: () => void;
};

export function TransferForm({
  action,
  defaults,
  options,
  transferGroupId,
  submitLabel,
  onSaved,
  onCancel,
}: TransferFormProps) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const firstFieldRef = useRef<HTMLSelectElement>(null);

  // `showModal()` puxa o foco para o botão de fechar; devolvemos para o primeiro campo.
  useEffect(() => {
    const frame = requestAnimationFrame(() => firstFieldRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const submitted = state.status === "error" ? state.values : undefined;
  const valueOf = (field: keyof TransferDefaults) => submitted?.[field] ?? defaults[field];

  useEffect(() => {
    if (state.status === "success") onSaved(state.message);
  }, [state, onSaved]);

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  return (
    <form ref={formRef} action={submit} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
      {transferGroupId && <input type="hidden" name="transferGroupId" value={transferGroupId} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="De" htmlFor={id("fromAccountId")} error={errorFor("fromAccountId")}>
          <Select
            ref={firstFieldRef}
            key={valueOf("fromAccountId")}
            id={id("fromAccountId")}
            name="fromAccountId"
            defaultValue={valueOf("fromAccountId")}
          >
            {options.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Para" htmlFor={id("toAccountId")} error={errorFor("toAccountId")}>
          <Select
            key={valueOf("toAccountId")}
            id={id("toAccountId")}
            name="toAccountId"
            defaultValue={valueOf("toAccountId")}
            invalid={Boolean(errorFor("toAccountId"))}
          >
            {options.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Descrição" htmlFor={id("description")} error={errorFor("description")}>
          <Input
            id={id("description")}
            name="description"
            defaultValue={valueOf("description")}
            placeholder="Pagamento de fatura, reserva…"
            invalid={Boolean(errorFor("description"))}
            required
          />
        </Field>

        <Field label="Valor" htmlFor={id("amountCents")} error={errorFor("amountCents")}>
          <AmountInput
            id={id("amountCents")}
            name="amountCents"
            defaultValue={valueOf("amountCents")}
            invalid={Boolean(errorFor("amountCents"))}
          />
        </Field>
      </div>

      <Field label="Data" htmlFor={id("date")} error={errorFor("date")}>
        <Input id={id("date")} name="date" type="date" defaultValue={valueOf("date")} required />
      </Field>

      <p className="text-texto-fraco text-xs">
        Uma transferência vira dois lançamentos ligados, um em cada conta. Ela não entra em receita
        nem em despesa.
      </p>

      {state.status === "error" && (
        <p role="alert" className="text-alerta text-sm">
          {state.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
