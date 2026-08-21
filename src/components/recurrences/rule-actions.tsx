"use client";

import { useActionState, useEffect } from "react";
import {
  deleteRecurringRuleAction,
  toggleRecurringRuleAction,
} from "@/app/(app)/recorrencias/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";

export function ToggleRule({ ruleId, active }: { ruleId: string; active: boolean }) {
  const [state, submit, pending] = useActionState(toggleRecurringRuleAction, IDLE_ACTION_STATE);
  useActionToast(state);

  return (
    <form action={submit}>
      <input type="hidden" name="ruleId" value={ruleId} />
      <input type="hidden" name="active" value={String(!active)} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        title={active ? "Parar de lançar sem apagar a regra" : "Voltar a lançar"}
      >
        {active ? "Pausar" : "Retomar"}
      </Button>
    </form>
  );
}

export function DeleteRule({ ruleId }: { ruleId: string }) {
  const [state, submit, pending] = useActionState(deleteRecurringRuleAction, IDLE_ACTION_STATE);
  useActionToast(state);

  return (
    <form action={submit}>
      <input type="hidden" name="ruleId" value={ruleId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        title="Apagar a regra. Os lançamentos já feitos continuam no extrato."
      >
        Excluir
      </Button>
    </form>
  );
}

function useActionToast(state: ActionState) {
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);
}
