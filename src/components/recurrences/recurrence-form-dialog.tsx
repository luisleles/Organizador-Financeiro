"use client";

import { useActionState, useCallback, useEffect, useId, useState } from "react";
import {
  createRecurringRuleAction,
  updateRecurringRuleAction,
} from "@/app/(app)/recorrencias/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { toISODate } from "@/lib/date";
import { formatCentsForInput } from "@/lib/money";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import { FREQUENCY_LABELS } from "@/server/recurrences/recurrence.labels";
import { RECURRING_FREQUENCIES } from "@/server/recurrences/recurrence.schema";
import type { RecurringRuleRow } from "@/server/recurrences/recurrence.types";

type Option = { id: string; name: string };

type RecurrenceFormDialogProps = {
  rule?: RecurringRuleRow;
  accounts: readonly Option[];
  categories: readonly Option[];
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function RecurrenceFormDialog({
  rule,
  accounts,
  categories,
  label,
  variant = "secondary",
  size = "md",
}: RecurrenceFormDialogProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        title={rule ? `Editar ${rule.description}` : "Nova recorrência"}
        description={
          rule
            ? "A mudança vale para as próximas ocorrências. O que já foi lançado não muda."
            : "O app lança sozinho toda ocorrência vencida quando você abre o Controle Financeiro."
        }
        onClose={close}
      >
        {open && (
          <RecurrenceForm rule={rule} accounts={accounts} categories={categories} onDone={close} />
        )}
      </Modal>
    </>
  );
}

function RecurrenceForm({
  rule,
  accounts,
  categories,
  onDone,
}: {
  rule?: RecurringRuleRow;
  accounts: readonly Option[];
  categories: readonly Option[];
  onDone: () => void;
}) {
  const [state, submit, pending] = useActionState(
    rule ? updateRecurringRuleAction : createRecurringRuleAction,
    IDLE_ACTION_STATE,
  );
  const fieldId = useId();
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onDone();
    }
    if (state.status === "error" && !state.fieldErrors) notify(state.message, "alerta");
  }, [state, notify, onDone]);

  const submitted = state.status === "error" ? state.values : undefined;
  const initial = {
    description: rule?.description ?? "",
    amountCents: rule ? formatCentsForInput(rule.amountCents) : "",
    type: rule?.type === "INCOME" ? "INCOME" : "EXPENSE",
    accountId: rule?.accountId ?? accounts[0]?.id ?? "",
    categoryId: rule?.categoryId ?? "",
    frequency: rule?.frequency ?? "MONTHLY",
    interval: String(rule?.interval ?? 1),
    dayOfMonth: rule?.dayOfMonth === null || rule === undefined ? "" : String(rule.dayOfMonth),
    startDate: rule ? toISODate(rule.startDate) : toISODate(new Date()),
    endDate: rule?.endDate ? toISODate(rule.endDate) : "",
  };
  const valueOf = (field: keyof typeof initial) => submitted?.[field] ?? initial[field];
  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  return (
    <form action={submit} className="flex flex-col gap-4">
      {rule && <input type="hidden" name="ruleId" value={rule.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Descrição" htmlFor={id("description")} error={errorFor("description")}>
          <Input
            id={id("description")}
            name="description"
            defaultValue={valueOf("description")}
            placeholder="Aluguel"
            invalid={Boolean(errorFor("description"))}
            required
          />
        </Field>

        <Field label="Valor" htmlFor={id("amountCents")} error={errorFor("amountCents")}>
          <Input
            id={id("amountCents")}
            name="amountCents"
            numeric
            prefix="R$"
            inputMode="decimal"
            defaultValue={valueOf("amountCents")}
            invalid={Boolean(errorFor("amountCents"))}
            required
          />
        </Field>

        <Field label="Tipo" htmlFor={id("type")} error={errorFor("type")}>
          <Select id={id("type")} name="type" key={valueOf("type")} defaultValue={valueOf("type")}>
            <option value="EXPENSE">Saída</option>
            <option value="INCOME">Entrada</option>
          </Select>
        </Field>

        <Field label="Conta" htmlFor={id("accountId")} error={errorFor("accountId")}>
          <Select
            id={id("accountId")}
            name="accountId"
            key={valueOf("accountId")}
            defaultValue={valueOf("accountId")}
          >
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Categoria" htmlFor={id("categoryId")} error={errorFor("categoryId")}>
          <Select
            id={id("categoryId")}
            name="categoryId"
            key={valueOf("categoryId")}
            defaultValue={valueOf("categoryId")}
          >
            <option value="">Sem categoria</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Frequência" htmlFor={id("frequency")} error={errorFor("frequency")}>
          <Select
            id={id("frequency")}
            name="frequency"
            key={valueOf("frequency")}
            defaultValue={valueOf("frequency")}
          >
            {RECURRING_FREQUENCIES.map((frequency) => (
              <option key={frequency} value={frequency}>
                {FREQUENCY_LABELS[frequency].singular}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="A cada"
          htmlFor={id("interval")}
          error={errorFor("interval")}
          hint="2 em semanal é quinzenal."
        >
          <Input
            id={id("interval")}
            name="interval"
            numeric
            type="number"
            min={1}
            max={60}
            defaultValue={valueOf("interval")}
            invalid={Boolean(errorFor("interval"))}
            required
          />
        </Field>

        <Field
          label="Dia do mês"
          htmlFor={id("dayOfMonth")}
          error={errorFor("dayOfMonth")}
          hint="Só em regras mensais. Vazio repete o dia do início."
        >
          <Input
            id={id("dayOfMonth")}
            name="dayOfMonth"
            numeric
            type="number"
            min={1}
            max={31}
            defaultValue={valueOf("dayOfMonth")}
            invalid={Boolean(errorFor("dayOfMonth"))}
          />
        </Field>

        <Field label="Início" htmlFor={id("startDate")} error={errorFor("startDate")}>
          <Input
            id={id("startDate")}
            name="startDate"
            type="date"
            defaultValue={valueOf("startDate")}
            required
          />
        </Field>

        <Field
          label="Término"
          htmlFor={id("endDate")}
          error={errorFor("endDate")}
          hint="Vazio é sem prazo para acabar."
        >
          <Input
            id={id("endDate")}
            name="endDate"
            type="date"
            defaultValue={valueOf("endDate")}
            invalid={Boolean(errorFor("endDate"))}
          />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
