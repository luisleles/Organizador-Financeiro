"use client";

import { useActionState, useEffect } from "react";
import { copyPreviousMonthAction } from "@/app/(app)/orcamentos/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE } from "@/server/action-state";

export function CopyPreviousMonth({ month }: { month: string }) {
  const [state, submit, pending] = useActionState(copyPreviousMonthAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="month" value={month} />
      <Button type="submit" disabled={pending}>
        {pending ? "Copiando…" : "Copiar do mês anterior"}
      </Button>
    </form>
  );
}
