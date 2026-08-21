"use client";

import { useActionState, useEffect, useState } from "react";
import { eraseAllDataAction } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { ERASE_CONFIRMATION } from "@/server/auth/auth.schema";
import { IDLE_ACTION_STATE } from "@/server/action-state";

/**
 * Dupla confirmação de verdade: primeiro abrir o diálogo, depois digitar a frase exata e a
 * senha. Nenhum dos dois passos é acidental, e não existe desfazer do outro lado.
 */
export function EraseDataDialog() {
  const [open, setOpen] = useState(false);
  const [frase, setFrase] = useState("");
  const [state, submit, pending] = useActionState(eraseAllDataAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      setOpen(false);
      setFrase("");
    }
    if (state.status === "error" && !state.fieldErrors) notify(state.message, "alerta");
  }, [state, notify]);

  const errorFor = (field: string) =>
    state.status === "error" ? state.fieldErrors?.[field]?.[0] : undefined;

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)} className="text-alerta self-start">
        Apagar todos os dados
      </Button>

      <Modal
        open={open}
        title="Apagar todos os dados"
        description="Some tudo: lançamentos, contas, categorias, tags, orçamentos, metas e recorrências. Sua conta de acesso continua. Não há como desfazer."
        onClose={() => setOpen(false)}
      >
        <form action={submit} className="flex flex-col gap-4">
          <p className="border-alerta bg-alerta-suave text-alerta rounded-md border px-3 py-2 text-sm">
            Faça um backup antes, se houver qualquer chance de você se arrepender.
          </p>

          <Field
            label={`Digite ${ERASE_CONFIRMATION}`}
            htmlFor="confirmacao"
            error={errorFor("confirmation")}
          >
            <Input
              id="confirmacao"
              name="confirmation"
              value={frase}
              onChange={(event) => setFrase(event.target.value)}
              invalid={Boolean(errorFor("confirmation"))}
              autoComplete="off"
              required
            />
          </Field>

          <Field label="Sua senha" htmlFor="senha-apagar" error={errorFor("password")}>
            <Input
              id="senha-apagar"
              name="password"
              type="password"
              autoComplete="current-password"
              invalid={Boolean(errorFor("password"))}
              required
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={pending || frase !== ERASE_CONFIRMATION}
            >
              {pending ? "Apagando…" : "Apagar para sempre"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
