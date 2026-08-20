"use client";

import { useActionState, useEffect } from "react";
import { setGoalArchivedAction } from "@/app/(app)/metas/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE } from "@/server/action-state";

export function ArchiveGoalButton({ goalId, archived }: { goalId: string; archived: boolean }) {
  const [state, submit, pending] = useActionState(setGoalArchivedAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message);
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="goalId" value={goalId} />
      <input type="hidden" name="archived" value={archived ? "0" : "1"} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {archived ? "Reativar" : "Arquivar"}
      </Button>
    </form>
  );
}
