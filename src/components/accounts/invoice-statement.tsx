import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableGroupRow, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import type { InvoiceStatus } from "@/server/accounts/account.credit-card";
import type { AccountInvoice } from "@/server/accounts/account.types";

const STATUS_TONE: Record<InvoiceStatus, "saida" | "neutro" | "previsto"> = {
  aberta: "saida",
  fechada: "neutro",
  futura: "previsto",
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
        <tbody key={invoice.key}>
          <TableGroupRow
            columnSpan={3}
            label={
              <span className="flex flex-wrap items-center gap-2">
                <span>Fatura de {formatDate(invoice.closingDate)}</span>
                <span className="text-texto-fraco font-normal normal-case">
                  vence {formatDate(invoice.dueDate)}
                </span>
                <Badge tone={STATUS_TONE[invoice.status]}>{invoice.status}</Badge>
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
