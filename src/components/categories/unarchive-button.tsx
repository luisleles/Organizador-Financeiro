"use client";

import { useActionState, useEffect } from "react";
import { unarchiveCategoryAction } from "@/app/(app)/categorias/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE } from "@/server/action-state";

type UnarchiveButtonProps = {
  categoryId: string;
};

export function UnarchiveButton({ categoryId }: UnarchiveButtonProps) {
  const [state, submit, pending] = useActionState(unarchiveCategoryAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message, "entrada");
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="categoryId" value={categoryId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>
        {pending ? "Reativando…" : "Reativar"}
      </Button>
    </form>
  );
}
