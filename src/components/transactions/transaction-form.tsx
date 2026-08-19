"use client";

import { useActionState, useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { DescriptionSuggestion, FilterOptions } from "@/server/transactions/transaction.types";
import { AmountInput } from "./amount-input";

export type TransactionDefaults = {
  date: string;
  type: string;
  accountId: string;
  description: string;
  amountCents: string;
  categoryId: string;
  tagIds: string[];
  notes: string;
};

type TransactionFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  defaults: TransactionDefaults;
  options: FilterOptions;
  suggestions: readonly DescriptionSuggestion[];
  transactionId?: string;
  submitLabel: string;
  onSaved: (message: string, sticky: TransactionDefaults) => void;
  onCancel: () => void;
};

export function TransactionForm({
  action,
  defaults,
  options,
  suggestions,
  transactionId,
  submitLabel,
  onSaved,
  onCancel,
}: TransactionFormProps) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const fieldId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  /**
   * `showModal()` do <dialog> move o foco para o primeiro elemento focável assim que abre,
   * o que atropela o `autoFocus` da descrição. Focar no próximo quadro devolve o cursor
   * para onde se digita — é o que faz o lançamento em série funcionar sem mouse.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => descriptionRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const submitted = state.status === "error" ? state.values : undefined;
  const valueOf = (field: keyof TransactionDefaults) =>
    submitted?.[field] ?? (defaults[field] as string);

  useEffect(() => {
    if (state.status !== "success") return;

    const form = formRef.current;
    onSaved(state.message, {
      ...defaults,
      date: readField(form, "date") ?? defaults.date,
      type: readField(form, "type") ?? defaults.type,
      accountId: readField(form, "accountId") ?? defaults.accountId,
      description: "",
      amountCents: "",
      categoryId: "",
      tagIds: [],
      notes: "",
    });
  }, [state, onSaved, defaults]);

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  /** Ctrl+Enter salva de qualquer campo, para não precisar sair do teclado. */
  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  /** Descrição repetida traz de volta a categoria usada da última vez. */
  function applySuggestion(description: string) {
    const category = categoryRef.current;
    if (!category || category.value !== "") return;

    const match = suggestions.find(
      (suggestion) =>
        suggestion.description.toLocaleLowerCase("pt-BR") ===
        description.toLocaleLowerCase("pt-BR"),
    );
    if (match?.categoryId) category.value = match.categoryId;
  }

  return (
    <form ref={formRef} action={submit} onKeyDown={handleKeyDown} className="flex flex-col gap-4">
      {transactionId && <input type="hidden" name="transactionId" value={transactionId} />}

      <fieldset className="flex gap-2">
        <legend className="sr-only">Tipo</legend>
        {[
          { value: "EXPENSE", label: "Despesa" },
          { value: "INCOME", label: "Receita" },
        ].map((option) => (
          <label key={option.value} className="flex-1">
            <input
              type="radio"
              name="type"
              value={option.value}
              defaultChecked={valueOf("type") === option.value}
              className="peer sr-only"
            />
            <span className="border-linha text-texto-fraco peer-checked:border-tinta peer-checked:bg-superficie peer-checked:text-texto peer-focus-visible:outline-foco block cursor-pointer rounded-md border py-2 text-center text-sm peer-focus-visible:outline-2">
              {option.label}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Descrição" htmlFor={id("description")} error={errorFor("description")}>
          <Input
            ref={descriptionRef}
            id={id("description")}
            name="description"
            list={`${fieldId}-historico`}
            defaultValue={valueOf("description")}
            onChange={(event) => applySuggestion(event.target.value)}
            placeholder="Mercado, Uber, Salário…"
            autoComplete="off"
            invalid={Boolean(errorFor("description"))}
            required
          />
          <datalist id={`${fieldId}-historico`}>
            {suggestions.map((suggestion) => (
              <option key={suggestion.description} value={suggestion.description} />
            ))}
          </datalist>
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

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Data" htmlFor={id("date")} error={errorFor("date")}>
          <Input id={id("date")} name="date" type="date" defaultValue={valueOf("date")} required />
        </Field>

        <Field label="Conta" htmlFor={id("accountId")} error={errorFor("accountId")}>
          <Select
            key={valueOf("accountId")}
            id={id("accountId")}
            name="accountId"
            defaultValue={valueOf("accountId")}
          >
            {options.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Categoria" htmlFor={id("categoryId")} error={errorFor("categoryId")}>
          <Select
            ref={categoryRef}
            key={valueOf("categoryId")}
            id={id("categoryId")}
            name="categoryId"
            defaultValue={valueOf("categoryId")}
          >
            <option value="">Sem categoria</option>
            {options.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      {options.tags.length > 0 && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-2xs text-texto-fraco font-semibold uppercase">Etiquetas</legend>
          <div className="flex flex-wrap gap-2 pt-1">
            {options.tags.map((tag) => (
              <label key={tag.id} className="cursor-pointer">
                <input
                  type="checkbox"
                  name="tagIds"
                  value={tag.id}
                  defaultChecked={defaults.tagIds.includes(tag.id)}
                  className="peer sr-only"
                />
                <span className="border-linha text-texto-fraco peer-checked:border-tinta peer-checked:text-texto peer-focus-visible:outline-foco block rounded-full border px-3 py-1 text-xs peer-focus-visible:outline-2">
                  {tag.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-alerta text-sm">
          {state.message}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-texto-fraco text-xs">
          <kbd className="valor">Ctrl</kbd> + <kbd className="valor">Enter</kbd> salva
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            Fechar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Salvando…" : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  );
}

function readField(form: HTMLFormElement | null, name: string): string | null {
  if (!form) return null;
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : null;
}
