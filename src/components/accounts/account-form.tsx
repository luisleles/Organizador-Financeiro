"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { formatCentsForInput } from "@/lib/money";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import { ACCOUNT_COLORS, ACCOUNT_ICONS, ACCOUNT_TYPES } from "@/server/accounts/account.schema";
import type { AccountSummary } from "@/server/accounts/account.types";
import { ACCOUNT_ICON_LABELS, ACCOUNT_TYPE_LABELS } from "./account-meta";

type AccountAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type AccountFormProps = {
  action: AccountAction;
  account?: AccountSummary;
  onSuccess: (message: string) => void;
  onCancel: () => void;
};

export function AccountForm({ action, account, onSuccess, onCancel }: AccountFormProps) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const fieldId = useId();

  const submitted = state.status === "error" ? state.values : undefined;

  const initial = {
    name: account?.name ?? "",
    institution: account?.institution ?? "",
    type: account?.type ?? "CHECKING",
    initialBalanceCents: formatCentsForInput(account?.initialBalanceCents ?? 0),
    color: account?.color ?? ACCOUNT_COLORS[0],
    icon: account?.icon ?? "landmark",
    closingDay: account?.creditCard ? String(account.creditCard.closingDay) : "",
    dueDay: account?.creditCard ? String(account.creditCard.dueDay) : "",
    creditLimitCents: account?.creditCard
      ? formatCentsForInput(account.creditCard.creditLimitCents)
      : "",
    lastFourDigits: account?.creditCard?.lastFourDigits ?? "",
    brand: account?.creditCard?.brand ?? "",
  };

  const valueOf = (field: keyof typeof initial) => submitted?.[field] ?? initial[field];

  // Só o tipo precisa de estado: é ele que decide se o bloco de fatura aparece.
  const [type, setType] = useState<string>(valueOf("type"));

  useEffect(() => {
    if (state.status === "success") onSuccess(state.message);
    if (state.status === "error" && state.values?.type) setType(state.values.type);
  }, [state, onSuccess]);

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  const id = (field: string) => `${fieldId}-${field}`;
  const isCreditCard = type === "CREDIT_CARD";

  return (
    <form action={submit} className="flex flex-col gap-4">
      {account && <input type="hidden" name="accountId" value={account.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={id("name")} error={errorFor("name")}>
          <Input
            id={id("name")}
            name="name"
            defaultValue={valueOf("name")}
            placeholder="Nubank"
            invalid={Boolean(errorFor("name"))}
            autoFocus
            required
          />
        </Field>

        <Field label="Instituição" htmlFor={id("institution")} error={errorFor("institution")}>
          <Input
            id={id("institution")}
            name="institution"
            defaultValue={valueOf("institution")}
            placeholder="Opcional"
          />
        </Field>

        <Field label="Tipo" htmlFor={id("type")} error={errorFor("type")}>
          {/*
            O React só aplica `defaultValue` de um <select> na montagem: depois do reset
            automático do form, ele voltaria para a primeira opção. A `key` remonta o
            campo quando o valor devolvido pela action muda, e aí o reset repõe o certo.
          */}
          <Select
            key={valueOf("type")}
            id={id("type")}
            name="type"
            defaultValue={valueOf("type")}
            onChange={(event) => setType(event.target.value)}
          >
            {ACCOUNT_TYPES.map((accountType) => (
              <option key={accountType} value={accountType}>
                {ACCOUNT_TYPE_LABELS[accountType]}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label={isCreditCard ? "Dívida inicial" : "Saldo inicial"}
          htmlFor={id("initialBalanceCents")}
          error={errorFor("initialBalanceCents")}
          hint={
            isCreditCard
              ? "Normalmente 0. Só é diferente se o cartão já tiver fatura em aberto no dia em que você cadastrá-lo — isto NÃO é o limite do cartão."
              : account
                ? undefined
                : "O saldo do dia em que você começa a registrar."
          }
        >
          <Input
            id={id("initialBalanceCents")}
            name="initialBalanceCents"
            numeric
            prefix="R$"
            inputMode="decimal"
            defaultValue={valueOf("initialBalanceCents")}
            invalid={Boolean(errorFor("initialBalanceCents"))}
          />
        </Field>

        <Field label="Ícone" htmlFor={id("icon")} error={errorFor("icon")}>
          <Select key={valueOf("icon")} id={id("icon")} name="icon" defaultValue={valueOf("icon")}>
            {ACCOUNT_ICONS.map((icon) => (
              <option key={icon} value={icon}>
                {ACCOUNT_ICON_LABELS[icon] ?? icon}
              </option>
            ))}
          </Select>
        </Field>

        <ColorField name="color" defaultValue={valueOf("color")} error={errorFor("color")} />
      </div>

      {isCreditCard && (
        <fieldset className="border-linha grid gap-4 rounded-md border p-4 sm:grid-cols-3">
          <legend className="text-2xs text-texto-fraco px-1 font-semibold uppercase">Fatura</legend>

          <Field label="Fecha no dia" htmlFor={id("closingDay")} error={errorFor("closingDay")}>
            <Input
              id={id("closingDay")}
              name="closingDay"
              type="number"
              min={1}
              max={31}
              numeric
              defaultValue={valueOf("closingDay")}
              invalid={Boolean(errorFor("closingDay"))}
            />
          </Field>

          <Field label="Vence no dia" htmlFor={id("dueDay")} error={errorFor("dueDay")}>
            <Input
              id={id("dueDay")}
              name="dueDay"
              type="number"
              min={1}
              max={31}
              numeric
              defaultValue={valueOf("dueDay")}
              invalid={Boolean(errorFor("dueDay"))}
            />
          </Field>

          <Field
            label="Limite"
            htmlFor={id("creditLimitCents")}
            error={errorFor("creditLimitCents")}
          >
            <Input
              id={id("creditLimitCents")}
              name="creditLimitCents"
              numeric
              prefix="R$"
              inputMode="decimal"
              defaultValue={valueOf("creditLimitCents")}
              invalid={Boolean(errorFor("creditLimitCents"))}
            />
          </Field>

          <Field label="Bandeira" htmlFor={id("brand")} error={errorFor("brand")}>
            <Input
              id={id("brand")}
              name="brand"
              defaultValue={valueOf("brand")}
              placeholder="Visa, Mastercard…"
              invalid={Boolean(errorFor("brand"))}
            />
          </Field>

          <Field
            label="4 últimos dígitos"
            htmlFor={id("lastFourDigits")}
            error={errorFor("lastFourDigits")}
          >
            <Input
              id={id("lastFourDigits")}
              name="lastFourDigits"
              inputMode="numeric"
              maxLength={4}
              defaultValue={valueOf("lastFourDigits")}
              placeholder="1234"
              invalid={Boolean(errorFor("lastFourDigits"))}
            />
          </Field>
        </fieldset>
      )}

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
          {pending ? "Salvando…" : account ? "Salvar" : "Criar conta"}
        </Button>
      </div>
    </form>
  );
}

type ColorFieldProps = {
  name: string;
  defaultValue: string;
  error?: string;
};

function ColorField({ name, defaultValue, error }: ColorFieldProps) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-2xs text-texto-fraco font-semibold uppercase">Cor</legend>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {ACCOUNT_COLORS.map((color) => (
          <label key={color} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={color}
              defaultChecked={color === defaultValue}
              className="peer sr-only"
            />
            <span
              aria-label={`Cor ${color}`}
              style={{ backgroundColor: color }}
              className={cn(
                "ring-offset-superficie block size-6 rounded-full ring-offset-2",
                "peer-checked:ring-texto peer-focus-visible:ring-foco peer-checked:ring-2 peer-focus-visible:ring-2",
              )}
            />
          </label>
        ))}
      </div>
      {error && <p className="text-alerta text-xs">{error}</p>}
    </fieldset>
  );
}
