import type { ReactNode } from "react";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableGroupRow, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import type {
  InvoiceCycleStatus,
  InvoicePaymentStatus,
} from "@/server/accounts/account.credit-card";
import type { AccountInvoice } from "@/server/accounts/account.types";

const CYCLE_TONE: Record<InvoiceCycleStatus, "saida" | "neutro"> = {
  OPEN: "saida",
  CLOSED: "neutro",
};

const CYCLE_LABEL: Record<InvoiceCycleStatus, string> = {
  OPEN: "aberta",
  CLOSED: "fechada",
};

const PAYMENT_TONE: Record<InvoicePaymentStatus, "entrada" | "neutro" | "previsto" | "alerta"> = {
  UNPAID: "neutro",
  PARTIALLY_PAID: "previsto",
  PAID: "entrada",
  OVERPAID: "alerta",
};

const PAYMENT_LABEL: Record<InvoicePaymentStatus, string> = {
  UNPAID: "não paga",
  PARTIALLY_PAID: "parcialmente paga",
  PAID: "paga",
  OVERPAID: "paga a mais",
};

type InvoiceStatementProps = {
  invoices: readonly AccountInvoice[];
  accountName: string;
  valuesHidden: boolean;
};

/**
 * O extrato de cartão é lido por fatura, não por dia: o que importa é o que vai ser
 * cobrado junto. Cada grupo carrega o próprio total na coluna de valores.
 */
export function InvoiceStatement({ invoices, accountName, valuesHidden }: InvoiceStatementProps) {
  return (
    <Table caption={`Faturas de ${accountName}`}>
      <thead>
        <tr>
          <TableHeadCell>Data</TableHeadCell>
          <TableHeadCell>Descrição</TableHeadCell>
          <TableHeadCell className="hidden sm:table-cell">Categoria</TableHeadCell>
          <TableHeadCell value>Valor</TableHeadCell>
        </tr>
      </thead>
      {invoices.map((invoice) => (
        <tbody key={invoice.id}>
          <TableGroupRow
            columnSpan={3}
            label={
              <span className="flex flex-wrap items-center gap-2">
                <span>Fatura de {formatDate(invoice.closingDate)}</span>
                <span className="text-texto-fraco font-normal normal-case">
                  vence {formatDate(invoice.dueDate)}
                </span>
                <Badge tone={CYCLE_TONE[invoice.cycleStatus]}>
                  {CYCLE_LABEL[invoice.cycleStatus]}
                </Badge>
                <Badge tone={PAYMENT_TONE[invoice.paymentStatus]}>
                  {PAYMENT_LABEL[invoice.paymentStatus]}
                </Badge>
                {paymentNote(invoice, valuesHidden)}
              </span>
            }
            total={<Amount cents={invoice.totalCents} size="sm" masked={valuesHidden} />}
          />
          {invoice.entries.map((entry) => (
            <tr key={entry.id}>
              <TableCell muted>
                <span className="valor text-num-xs">{formatDate(entry.date)}</span>
              </TableCell>
              <TableCell>
                <span className="flex items-center gap-2">
                  {entry.description}
                  {entry.isTransfer && <Badge tone="neutro">pagamento</Badge>}
                  {entry.isRefund && <Badge tone="entrada">estorno</Badge>}
                </span>
              </TableCell>
              <TableCell muted className="hidden sm:table-cell">
                {entry.categoryName ?? "—"}
              </TableCell>
              <TableCell value>
                <Amount cents={entry.amountCents} masked={valuesHidden} />
              </TableCell>
            </tr>
          ))}
        </tbody>
      ))}
    </Table>
  );
}

/**
 * Só aparece nos dois casos em que o saldo sozinho engana: paga e ainda aberta esconde que
 * já entrou lançamento novo depois do pagamento, e paga a mais esconde o crédito que sobrou.
 */
function paymentNote(invoice: AccountInvoice, masked: boolean): ReactNode {
  if (invoice.paymentStatus === "PARTIALLY_PAID" && invoice.paidAt) {
    return (
      <span className="text-texto-fraco font-normal normal-case">
        paga em {formatDate(invoice.paidAt)} —{" "}
        <Amount cents={-invoice.totalCents} size="xs" sign="never" masked={masked} /> lançados
        depois
      </span>
    );
  }
  if (invoice.paymentStatus === "OVERPAID") {
    return (
      <span className="text-texto-fraco font-normal normal-case">
        <Amount cents={invoice.totalCents} size="xs" sign="never" masked={masked} /> de crédito
      </span>
    );
  }
  return null;
}
