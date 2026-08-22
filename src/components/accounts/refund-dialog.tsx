"use client";

import { useActionState, useEffect, useState } from "react";
import { registerRefundAction } from "@/app/(app)/contas/actions";
import { AmountInput } from "@/components/transactions/amount-input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/date";
import { IDLE_ACTION_STATE } from "@/server/action-state";

type RefundDialogProps = {
  accountId: string;
  /** Compras recentes do cartão, para vincular o estorno — o vínculo é só informativo. */
  purchases: readonly { id: string; description: string; date: Date }[];
  today: string;
};

export function RefundDialog({ accountId, purchases, today }: RefundDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState(registerRefundAction, IDLE_ACTION_STATE);
  const { notify } = useToast();

  useEffect(() => {
    if (state.status === "success") {
      notify(state.message, "entrada");
      setOpen(false);
    }
  }, [state, notify]);

  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Registrar estorno
      </Button>
      <Modal
        open={open}
        title="Registrar estorno"
        description="Um estorno entra como dinheiro no cartão, reduz a fatura e libera limite — mas nunca conta como receita em relatório nenhum."
        onClose={() => setOpen(false)}
      >
        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="accountId" value={accountId} />
          <Field label="Descrição" htmlFor="refund-description">
            <Input
              id="refund-description"
              name="description"
              placeholder="Devolução da compra…"
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor" htmlFor="refund-amount">
              <AmountInput id="refund-amount" name="amountCents" />
            </Field>
            <Field label="Data" htmlFor="refund-date">
              <Input id="refund-date" name="date" type="date" defaultValue={today} required />
            </Field>
          </div>
          {purchases.length > 0 && (
            <Field
              label="Compra original (opcional)"
              htmlFor="refund-original"
              hint="Só para rastreabilidade: parcelas restantes de uma compra parcelada continuam existindo e precisam da edição de parcelamento."
            >
              <Select id="refund-original" name="originalTransactionId" defaultValue="">
                <option value="">Sem vínculo</option>
                {purchases.map((purchase) => (
                  <option key={purchase.id} value={purchase.id}>
                    {formatDate(purchase.date)} · {purchase.description}
                  </option>
                ))}
              </Select>
            </Field>
          )}
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
              {pending ? "Registrando…" : "Registrar estorno"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
