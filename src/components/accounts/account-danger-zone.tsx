"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { IDLE_ACTION_STATE, type ActionState } from "@/server/action-state";
import type { AccountSummary } from "@/server/accounts/account.types";

type AccountAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

type AccountDangerZoneProps = {
  account: AccountSummary;
  archiveAction: AccountAction;
  deleteAction: AccountAction;
};

export function AccountDangerZone({
  account,
  archiveAction,
  deleteAction,
}: AccountDangerZoneProps) {
  const deletable = account.transactionCount === 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ArchiveButton account={account} action={archiveAction} />
        {deletable && <DeleteButton account={account} action={deleteAction} />}
      </div>
      <p className="text-texto-fraco text-xs">
        {deletable
          ? "Esta conta ainda não tem lançamentos, então pode ser excluída de vez."
          : `Com ${account.transactionCount} lançamentos, esta conta só pode ser arquivada — excluir levaria o histórico junto.`}
      </p>
    </div>
  );
}

function ArchiveButton({ account, action }: { account: AccountSummary; action: AccountAction }) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") notify(state.message);
    if (state.status === "error") notify(state.message, "alerta");
  }, [state, notify]);

  return (
    <form action={submit}>
      <input type="hidden" name="accountId" value={account.id} />
      <input type="hidden" name="archived" value={account.archived ? "0" : "1"} />
      <Button type="submit" variant="secondary" disabled={pending}>
        {account.archived ? "Reativar conta" : "Arquivar conta"}
      </Button>
    </form>
  );
}

function DeleteButton({ account, action }: { account: AccountSummary; action: AccountAction }) {
  const [state, submit, pending] = useActionState(action, IDLE_ACTION_STATE);
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  // Em caso de sucesso a própria action redireciona para a lista; aqui só resta o erro.
  useEffect(() => {
    if (state.status === "error") {
      setOpen(false);
      notify(state.message, "alerta");
    }
  }, [state, notify]);

  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Excluir
      </Button>

      <Modal
        open={open}
        title={`Excluir ${account.name}`}
        description="A conta some de vez. Como ela não tem lançamentos, nenhum histórico é perdido."
        onClose={() => setOpen(false)}
        footer={
          <form action={submit} className="flex gap-2">
            <input type="hidden" name="accountId" value={account.id} />
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" disabled={pending}>
              {pending ? "Excluindo…" : "Excluir conta"}
            </Button>
          </form>
        }
      >
        <p className="text-texto-fraco">Esta ação não pode ser desfeita.</p>
      </Modal>
    </>
  );
}
