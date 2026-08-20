"use client";

import { useActionState, useEffect, useState } from "react";
import { payInvoiceAction } from "@/app/(app)/contas/actions";
import { AmountInput } from "@/components/transactions/amount-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatCentsForInput } from "@/lib/money";
import { IDLE_ACTION_STATE } from "@/server/action-state";

type InvoicePaymentDialogProps = {
  invoiceId: string;
  outstandingCents: number;
  accounts: readonly { id: string; name: string }[];
  today: string;
  disabled?: boolean;
};

export function InvoicePaymentDialog({
  invoiceId,
  outstandingCents,
  accounts,
  today,
  disabled,
}: InvoicePaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(payInvoiceAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      setOpen(false);
    }
  }, [state, notify]);

  return (
    <>
      <Button
        variant="primary"
        onClick={() => setOpen(true)}
        disabled={disabled || accounts.length === 0}
      >
        Pagar fatura
      </Button>
      <Modal
        open={open}
        title="Pagar fatura"
        description="O pagamento move o valor da conta escolhida para o cartão, sem criar uma nova despesa."
        onClose={() => setOpen(false)}
      >
        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Field label="Conta de origem" htmlFor="invoice-from-account">
            <Select id="invoice-from-account" name="fromAccountId">
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" htmlFor="invoice-payment-amount">
              <AmountInput
                id="invoice-payment-amount"
                name="amountCents"
                defaultValue={formatCentsForInput(outstandingCents)}
              />
            </Field>
            <Field label="Data" htmlFor="invoice-payment-date">
              <Input
                id="invoice-payment-date"
                name="date"
                type="date"
                defaultValue={today}
                required
              />
            </Field>
          </div>
          {state.status === "error" && (
            <p className="text-alerta text-sm" role="alert">
              {state.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Pagando…" : "Confirmar pagamento"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
