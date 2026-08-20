"use client";

import { useActionState, useEffect, useState } from "react";
import { createTagAction, deleteTagAction, updateTagAction } from "@/app/(app)/categorias/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import { TAG_COLORS } from "@/server/categories/category.schema";
import type { TagSummary } from "@/server/categories/category.types";

type TagManagerProps = {
  tags: readonly TagSummary[];
};

/** Etiqueta é lista plana e sem arquivamento: o CRUD cabe na própria linha. */
export function TagManager({ tags }: TagManagerProps) {
  return (
    <div className="flex flex-col gap-4">
      <TagForm action={createTagAction} submitLabel="Adicionar" />

      {tags.length === 0 ? (
        <p className="text-texto-fraco text-sm">
          Nenhuma etiqueta ainda. Etiquetas cruzam categorias: &ldquo;Reembolsável&rdquo; pode cair
          em transporte e em saúde.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="border-linha flex flex-wrap items-center gap-3 rounded-md border px-3 py-2"
            >
              <span
                aria-hidden
                className="size-3 shrink-0 rounded-full"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-sm font-medium">{tag.name}</span>
              <span className="valor text-num-xs text-texto-fraco">
                {tag.transactionCount} {tag.transactionCount === 1 ? "lançamento" : "lançamentos"}
              </span>
              <div className="ml-auto flex items-center gap-1">
                <EditTagDialog tag={tag} />
                <DeleteTagDialog tag={tag} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type TagFormProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  tag?: TagSummary;
  submitLabel: string;
  onDone?: () => void;
};

function TagForm({ action, tag, submitLabel, onDone }: TagFormProps) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      onDone?.();
    }
  }, [state, notify, onDone]);

  const submitted = state.status === "error" ? state.values : undefined;
  const nameError = state.status === "error" ? state.fieldErrors?.name?.[0] : undefined;

  return (
    <form action={submit} className="flex flex-wrap items-start gap-2">
      {tag && <input type="hidden" name="tagId" value={tag.id} />}

      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <Input
          name="name"
          aria-label="Nome da etiqueta"
          placeholder="Reembolsável"
          defaultValue={submitted?.name ?? tag?.name ?? ""}
          invalid={Boolean(nameError)}
          required
        />
        {nameError && <p className="text-alerta text-xs">{nameError}</p>}
      </div>

      <fieldset className="flex flex-wrap gap-1.5 pt-2">
        <legend className="sr-only">Cor da etiqueta</legend>
        {TAG_COLORS.map((color) => (
          <label key={color} className="cursor-pointer">
            <input
              type="radio"
              name="color"
              value={color}
              defaultChecked={color === (submitted?.color ?? tag?.color ?? TAG_COLORS[0])}
              className="peer sr-only"
            />
            <span
              aria-label={`Cor ${color}`}
              style={{ backgroundColor: color }}
              className={cn(
                "ring-offset-superficie block size-5 rounded-full ring-offset-2",
                "peer-checked:ring-texto peer-focus-visible:ring-foco peer-checked:ring-2 peer-focus-visible:ring-2",
              )}
            />
          </label>
        ))}
      </fieldset>

      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Salvando…" : submitLabel}
      </Button>
    </form>
  );
}

function EditTagDialog({ tag }: { tag: TagSummary }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Editar
      </Button>
      <Modal open={open} title={`Editar ${tag.name}`} onClose={() => setOpen(false)}>
        {open && (
          <TagForm
            action={updateTagAction}
            tag={tag}
            submitLabel="Salvar"
            onDone={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}

function DeleteTagDialog({ tag }: { tag: TagSummary }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(deleteTagAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message);
      setOpen(false);
    }
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Excluir
      </Button>
      <Modal
        open={open}
        title={`Excluir ${tag.name}`}
        description="Nenhum lançamento é apagado; eles só perdem esta etiqueta."
        onClose={() => setOpen(false)}
        footer={
          <form action={submit} className="flex gap-2">
            <input type="hidden" name="tagId" value={tag.id} />
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Excluindo…" : "Excluir"}
            </Button>
          </form>
        }
      >
        <p className="text-texto-fraco">
          {tag.transactionCount === 0 ? (
            "Esta etiqueta não está em uso."
          ) : (
            <>
              <Badge tone="neutro">{tag.transactionCount}</Badge> lançamentos usam esta etiqueta.
            </>
          )}
        </p>
      </Modal>
    </>
  );
}
