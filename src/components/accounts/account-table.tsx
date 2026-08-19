import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { isLimitAlert } from "@/server/accounts/account.credit-card";
import type { AccountSummary } from "@/server/accounts/account.types";
import { ACCOUNT_TYPE_LABELS, AccountMark } from "./account-meta";

type AccountNameCellProps = {
  account: AccountSummary;
  subtitle: string;
};

function AccountNameCell({ account, subtitle }: AccountNameCellProps) {
  return (
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
          <span className="text-texto-fraco text-xs">{subtitle}</span>
        </span>
        {account.archived && <Badge tone="previsto">arquivada</Badge>}
      </div>
    </TableCell>
  );
}

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
            <AccountNameCell
              account={account}
              subtitle={account.institution ?? ACCOUNT_TYPE_LABELS[account.type]}
            />
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

type CreditCardTableProps = {
  accounts: readonly AccountSummary[];
  valuesHidden: boolean;
};

/** Cartão tem tabela própria porque as colunas são outras: fatura e limite, nunca saldo. */
export function CreditCardTable({ accounts, valuesHidden }: CreditCardTableProps) {
  return (
    <Table caption="Cartões de crédito com fatura e limite">
      <thead>
        <tr>
          <TableHeadCell>Cartão</TableHeadCell>
          <TableHeadCell className="hidden sm:table-cell">Uso do limite</TableHeadCell>
          <TableHeadCell className="hidden md:table-cell">Limite disponível</TableHeadCell>
          <TableHeadCell value>Fatura atual</TableHeadCell>
        </tr>
      </thead>
      <tbody>
        {accounts.map((account) => {
          const card = account.creditCard;

          return (
            <tr key={account.id} className="hover:bg-fundo">
              <AccountNameCell
                account={account}
                subtitle={account.institution ?? ACCOUNT_TYPE_LABELS[account.type]}
              />
              <TableCell muted className="hidden sm:table-cell">
                {card ? (
                  <span
                    className={`valor text-num-xs ${isLimitAlert(card.limitUsagePercent) ? "text-alerta" : ""}`}
                  >
                    {valuesHidden ? "••" : `${Math.round(card.limitUsagePercent)}%`}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell muted className="hidden md:table-cell">
                {card ? (
                  <Amount
                    cents={card.availableLimitCents}
                    size="xs"
                    tone={card.availableLimitCents < 0 ? "alerta" : "entrada"}
                    sign="negative"
                    masked={valuesHidden}
                  />
                ) : (
                  "—"
                )}
              </TableCell>
              <TableCell value>
                {card ? (
                  <Amount
                    cents={Math.abs(card.currentDebtCents)}
                    size="sm"
                    tone={card.currentDebtCents < 0 ? "saida" : "neutro"}
                    sign="never"
                    masked={valuesHidden}
                  />
                ) : (
                  <span className="text-texto-fraco text-xs">sem limite cadastrado</span>
                )}
              </TableCell>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
