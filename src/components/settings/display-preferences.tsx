"use client";

import { useActionState, useEffect } from "react";
import { setValuesHiddenAction } from "@/app/(app)/configuracoes/actions";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE } from "@/server/action-state";

export function DisplayPreferences({ valuesHidden }: { valuesHidden: boolean }) {
  const [state, submit, pending] = useActionState(setValuesHiddenAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
  }, [state, notify]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-texto text-sm">Tema</span>
          <span className="text-texto-fraco text-xs">
            Claro, escuro ou o que o sistema estiver usando.
          </span>
        </span>
        <ThemeToggle />
      </div>

      <div className="border-linha flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <span className="flex flex-col">
          <span className="text-texto text-sm">Esconder valores</span>
          <span className="text-texto-fraco text-xs">
            Mascara todo valor em BRL na tela. Fica salvo em cookie, então o servidor já manda a
            página mascarada — sem aquele instante com os números à mostra.
          </span>
        </span>
        <form action={submit}>
          <input type="hidden" name="hidden" value={String(!valuesHidden)} />
          <Button type="submit" variant="secondary" size="sm" disabled={pending}>
            {valuesHidden ? "Mostrar valores" : "Esconder valores"}
          </Button>
        </form>
      </div>
    </div>
  );
}
