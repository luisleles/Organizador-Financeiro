"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ActionState } from "@/server/action-state";
import type { AccountSummary } from "@/server/accounts/account.types";
import { AccountForm } from "./account-form";

type AccountFormDialogProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  account?: AccountSummary;
  variant?: "primary" | "secondary";
};

export function AccountFormDialog({
  action,
  label,
  account,
  variant = "secondary",
}: AccountFormDialogProps) {
  const [open, setOpen] = useState(false);
  const { notify } = useToast();

  const close = useCallback(() => setOpen(false), []);

  const handleSuccess = useCallback(
    (message: string) => {
      setOpen(false);
      notify(message, "entrada");
    },
    [notify],
  );

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <Modal
        open={open}
        title={account ? `Editar ${account.name}` : "Nova conta"}
        description={
          account
            ? "Alterar o saldo inicial recalcula o saldo atual de toda a conta."
            : "O saldo atual é o saldo inicial mais tudo que for lançado depois."
        }
        onClose={close}
      >
        {/* Montar o formulário só com o modal aberto zera o estado da action a cada abertura. */}
        {open && (
          <AccountForm
            action={action}
            account={account}
            onSuccess={handleSuccess}
            onCancel={close}
          />
        )}
      </Modal>
    </>
  );
}
