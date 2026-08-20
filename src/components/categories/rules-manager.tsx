"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createCategoryRuleAction,
  deleteCategoryRuleAction,
  reprocessUncategorizedAction,
  updateCategoryRuleAction,
} from "@/app/(app)/categorias/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { CategoryRuleRow, CategorySummary } from "@/server/categories/category.types";

type RulesManagerProps = {
  rules: readonly CategoryRuleRow[];
  categories: readonly CategorySummary[];
  uncategorizedCount: number;
};

export function RulesManager({ rules, categories, uncategorizedCount }: RulesManagerProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-texto-fraco text-sm">
        Se a descrição contém um trecho, o lançamento recebe a categoria da regra. O casamento
        ignora acento e maiúscula, e a regra só preenche o que ficou em branco — escolha manual
        sempre vence. Empatou, ganha o padrão mais longo, que é o mais específico.
      </p>

      <RuleForm
        action={createCategoryRuleAction}
        categories={categories}
        submitLabel="Criar regra"
      />

      {rules.length > 0 && (
        <ul className="flex flex-col gap-1">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="border-linha flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
            >
              <code className="valor text-num-xs text-texto">contém “{rule.pattern}”</code>
              <span aria-hidden className="text-texto-fraco">
                →
              </span>
              <span className="text-sm font-medium">{rule.categoryName}</span>
              <span className="valor text-num-xs text-texto-fraco">prioridade {rule.priority}</span>
              {!rule.active && <Badge tone="previsto">desligada</Badge>}

              <div className="ml-auto flex items-center gap-1">
                <EditRuleDialog rule={rule} categories={categories} />
                <DeleteRuleButton rule={rule} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <ReprocessButton uncategorizedCount={uncategorizedCount} />
    </div>
  );
}

type RuleFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: readonly CategorySummary[];
  rule?: CategoryRuleRow;
  submitLabel: string;
  onDone?: () => void;
};

function RuleForm({ action, categories, rule, submitLabel, onDone }: RuleFormProps) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onDone?.();
    }
  }, [state, notify, onDone]);

  const submitted = state.status === "error" ? state.values : undefined;
  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <form action={submit} className="flex flex-wrap items-start gap-2">
      {rule && <input type="hidden" name="ruleId" value={rule.id} />}

      <div className="flex min-w-44 flex-1 flex-col gap-1">
        <Input
          name="pattern"
          aria-label="Trecho da descrição"
          placeholder="uber"
          defaultValue={submitted?.pattern ?? rule?.pattern ?? ""}
          invalid={Boolean(errorFor("pattern"))}
          required
        />
        {errorFor("pattern") && <p className="text-alerta text-xs">{errorFor("pattern")}</p>}
      </div>

      <Select
        key={submitted?.categoryId ?? rule?.categoryId ?? ""}
        name="categoryId"
        aria-label="Categoria da regra"
        defaultValue={submitted?.categoryId ?? rule?.categoryId ?? ""}
        className="w-48"
        required
      >
        <option value="">Categoria…</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </Select>

      <Input
        name="priority"
        type="number"
        min={0}
        max={999}
        numeric
        aria-label="Prioridade"
        className="w-20"
        defaultValue={submitted?.priority ?? String(rule?.priority ?? 0)}
      />

      <label className="text-texto-fraco flex h-10 items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={rule?.active ?? true} />
        Ativa
      </label>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}

function EditRuleDialog({
  rule,
  categories,
}: {
  rule: CategoryRuleRow;
  categories: readonly CategorySummary[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Editar
      </Button>
      <Modal open={open} title="Editar regra" onClose={() => setOpen(false)}>
        {open && (
          <RuleForm
            action={updateCategoryRuleAction}
            categories={categories}
            rule={rule}
            submitLabel="Salvar"
            onDone={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}

function DeleteRuleButton({ rule }: { rule: CategoryRuleRow }) {
  const [state, submit, pending] = useActionState(deleteCategoryRuleAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message);
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="ruleId" value={rule.id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        Excluir
      </Button>
    </form>
  );
}

function ReprocessButton({ uncategorizedCount }: { uncategorizedCount: number }) {
  const [state, submit, pending] = useActionState(reprocessUncategorizedAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit} className="border-linha flex items-center gap-3 border-t pt-3">
      <Button type="submit" disabled={pending || uncategorizedCount === 0}>
        {pending ? "Reprocessando…" : "Reprocessar sem categoria"}
      </Button>
      <p className="text-texto-fraco text-xs">
        {uncategorizedCount === 0 ? (
          "Nenhum lançamento sem categoria."
        ) : (
          <>
            <span className="valor text-texto">{uncategorizedCount}</span>{" "}
            {uncategorizedCount === 1 ? "lançamento está" : "lançamentos estão"} sem categoria.
            Lançamentos já categorizados não são tocados.
          </>
        )}
      </p>
    </form>
  );
}
