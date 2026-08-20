"use client";

import { useActionState, useEffect, useState } from "react";
import { archiveCategoryAction } from "@/app/(app)/categorias/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE } from "@/server/action-state";
import type { CategorySummary } from "@/server/categories/category.types";

type ArchiveCategoryDialogProps = {
  category: CategorySummary;
  subcategories: readonly CategorySummary[];
  /** Destinos possíveis: tudo que não está sendo arquivado junto. */
  destinations: readonly CategorySummary[];
};

/**
 * Arquivar não apaga lançamento. Quando existe histórico, a pergunta obrigatória é para
 * onde ele vai — deixar tudo sem categoria é uma escolha, não o padrão silencioso.
 */
export function ArchiveCategoryDialog({
  category,
  subcategories,
  destinations,
}: ArchiveCategoryDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(archiveCategoryAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message);
      setOpen(false);
    }
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  const affectedCount =
    category.transactionCount +
    subcategories.reduce((total, child) => total + child.transactionCount, 0);

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Arquivar
      </Button>

      <Modal
        open={open}
        title={`Arquivar ${category.name}`}
        description={
          subcategories.length > 0
            ? `As ${subcategories.length} subcategorias são arquivadas junto.`
            : undefined
        }
        onClose={() => setOpen(false)}
      >
        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="categoryId" value={category.id} />

          {affectedCount > 0 ? (
            <Field
              label="Realocar lançamentos para"
              htmlFor={`realocar-${category.id}`}
              hint={`${affectedCount} ${affectedCount === 1 ? "lançamento usa" : "lançamentos usam"} esta categoria.`}
            >
              <Select id={`realocar-${category.id}`} name="reassignToId" defaultValue="">
                <option value="">Deixar sem categoria</option>
                {destinations.map((destination) => (
                  <option key={destination.id} value={destination.id}>
                    {destination.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-texto-fraco text-sm">
              Nenhum lançamento usa esta categoria, então não há nada para realocar.
            </p>
          )}

          <p className="text-texto-fraco text-xs">
            Arquivar tira a categoria das listas e desliga as regras que apontavam para ela. Nada é
            apagado, e dá para reativar depois.
          </p>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Arquivando…" : "Arquivar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
