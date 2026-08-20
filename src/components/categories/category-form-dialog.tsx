"use client";

import { useActionState, useCallback, useEffect, useId, useState } from "react";
import { createCategoryAction, updateCategoryAction } from "@/app/(app)/categorias/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "@/server/categories/category.schema";
import type { CategorySummary } from "@/server/categories/category.types";
import { CategoryIcon } from "./category-icon";

type CategoryFormDialogProps = {
  category?: CategorySummary;
  /** Categorias que podem ser pai: só as de primeiro nível. */
  parents: readonly CategorySummary[];
  defaultParentId?: string | null;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function CategoryFormDialog({
  category,
  parents,
  defaultParentId = null,
  label,
  variant = "secondary",
  size = "md",
}: CategoryFormDialogProps) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        title={category ? `Editar ${category.name}` : "Nova categoria"}
        description={
          category
            ? undefined
            : "Uma subcategoria precisa ser do mesmo tipo do pai, e a hierarquia tem um nível só."
        }
        onClose={close}
      >
        {open && (
          <CategoryForm
            category={category}
            parents={parents}
            defaultParentId={defaultParentId}
            onDone={close}
          />
        )}
      </Modal>
    </>
  );
}

type CategoryFormProps = {
  category?: CategorySummary;
  parents: readonly CategorySummary[];
  defaultParentId: string | null;
  onDone: () => void;
};

function CategoryForm({ category, parents, defaultParentId, onDone }: CategoryFormProps) {
  const [state, submit, pending] = useActionState(
    category ? updateCategoryAction : createCategoryAction,
    IDLE_ACTION_STATE,
  );
  const fieldId = useId();
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onDone();
    }
  }, [state, notify, onDone]);

  const submitted = state.status === "error" ? state.values : undefined;
  const initial = {
    name: category?.name ?? "",
    kind: category?.kind ?? "EXPENSE",
    color: category?.color ?? CATEGORY_COLORS[0],
    icon: category?.icon ?? CATEGORY_ICONS[0],
    parentId: category?.parentId ?? defaultParentId ?? "",
  };
  const valueOf = (field: keyof typeof initial) => submitted?.[field] ?? initial[field];
  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;
  const id = (field: string) => `${fieldId}-${field}`;

  const eligibleParents = parents.filter((parent) => parent.id !== category?.id);

  return (
    <form action={submit} className="flex flex-col gap-4">
      {category && <input type="hidden" name="categoryId" value={category.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" htmlFor={id("name")} error={errorFor("name")}>
          <Input
            id={id("name")}
            name="name"
            defaultValue={valueOf("name")}
            placeholder="Alimentação"
            invalid={Boolean(errorFor("name"))}
            required
          />
        </Field>

        <Field label="Tipo" htmlFor={id("kind")} error={errorFor("kind")}>
          <Select key={valueOf("kind")} id={id("kind")} name="kind" defaultValue={valueOf("kind")}>
            <option value="EXPENSE">Despesa</option>
            <option value="INCOME">Receita</option>
          </Select>
        </Field>

        <Field
          label="Categoria pai"
          htmlFor={id("parentId")}
          error={errorFor("parentId")}
          hint="Deixe em branco para ser uma categoria de primeiro nível."
        >
          <Select
            key={valueOf("parentId")}
            id={id("parentId")}
            name="parentId"
            defaultValue={valueOf("parentId")}
          >
            <option value="">Nenhuma</option>
            {eligibleParents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </Select>
        </Field>

        <IconField name="icon" defaultValue={valueOf("icon")} error={errorFor("icon")} />
      </div>

      <ColorField name="color" defaultValue={valueOf("color")} error={errorFor("color")} />

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
          {pending ? "Salvando…" : category ? "Salvar" : "Criar"}
        </Button>
      </div>
    </form>
  );
}

function IconField({
  name,
  defaultValue,
  error,
}: {
  name: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-2xs text-texto-fraco font-semibold uppercase">Ícone</legend>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {CATEGORY_ICONS.map((icon) => (
          <label key={icon} className="cursor-pointer">
            <input
              type="radio"
              name={name}
              value={icon}
              defaultChecked={icon === defaultValue}
              className="peer sr-only"
            />
            <span className="border-linha text-texto-fraco peer-checked:border-tinta peer-checked:text-texto peer-focus-visible:outline-foco flex size-8 items-center justify-center rounded-md border peer-focus-visible:outline-2">
              <CategoryIcon icon={icon} className="size-4" />
            </span>
          </label>
        ))}
      </div>
      {error && <p className="text-alerta text-xs">{error}</p>}
    </fieldset>
  );
}

function ColorField({
  name,
  defaultValue,
  error,
}: {
  name: string;
  defaultValue: string;
  error?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-2xs text-texto-fraco font-semibold uppercase">Cor</legend>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {CATEGORY_COLORS.map((color) => (
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
