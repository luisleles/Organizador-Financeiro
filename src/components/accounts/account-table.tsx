import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import type { AccountSummary } from "@/server/accounts/account.types";
import { ACCOUNT_TYPE_LABELS, AccountMark } from "./account-meta";

type AccountTableProps = {
  accounts: readonly AccountSummary[];
  valuesHidden: boolean;
};

export function AccountTable({ accounts, valuesHidden }: AccountTableProps) {
  return (
    <Table caption="Contas com saldo atual">
      <thead>
        <tr>
          <TableHeadCell>Conta</TableHeadCell>
          <TableHeadCell className="hidden sm:table-cell">Tipo</TableHeadCell>
          <TableHeadCell className="hidden md:table-cell">Lançamentos</TableHeadCell>
          <TableHeadCell value>Saldo</TableHeadCell>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => (
          <tr key={account.id} className="hover:bg-fundo">
            <TableCell>
              <div className="flex items-center gap-3">
                <AccountMark color={account.color} icon={account.icon} />
                <span className="flex flex-col">
                  <Link
                    href={`/contas/${account.id}`}
                    className="text-texto font-medium hover:underline hover:underline-offset-4"
                  >
                    {account.name}
                  </Link>
                  <span className="text-texto-fraco text-xs">
                    {account.institution ?? ACCOUNT_TYPE_LABELS[account.type]}
                  </span>
                </span>
                {account.archived && <Badge tone="previsto">arquivada</Badge>}
              </div>
            </TableCell>
            <TableCell muted className="hidden sm:table-cell">
              {ACCOUNT_TYPE_LABELS[account.type]}
            </TableCell>
            <TableCell muted className="hidden md:table-cell">
              <span className="valor text-num-xs">{account.transactionCount}</span>
            </TableCell>
            <TableCell value>
              <Amount
                cents={account.balanceCents}
                size="sm"
                tone={account.balanceCents < 0 ? "alerta" : "neutro"}
                sign="negative"
                masked={valuesHidden}
              />
            </TableCell>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
