import Link from "next/link";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
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
            className="link-acao text-texto font-medium hover:underline hover:underline-offset-4"
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
        {accounts.flatMap((account) => [
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
                cents={account.totalBalanceCents}
                size="sm"
                tone={account.totalBalanceCents < 0 ? "alerta" : "neutro"}
                sign="negative"
                masked={valuesHidden}
              />
              {account.buckets.length > 0 && (
                <span className="text-texto-fraco block text-xs">
                  livre{" "}
                  <Amount
                    cents={account.availableBalanceCents}
                    size="xs"
                    tone="neutro"
                    sign="negative"
                    masked={valuesHidden}
                  />
                </span>
              )}
            </TableCell>
          </tr>,
          /* Caixinha aparece indentada sob a mãe, nunca como conta de primeiro nível. */
          ...account.buckets.map((bucket) => (
            <tr key={bucket.id} className="hover:bg-fundo">
              <TableCell>
                <div className="flex items-center gap-3 pl-8">
                  <span aria-hidden className="text-texto-fraco text-xs">
                    ↳
                  </span>
                  <AccountMark color={bucket.color} icon={bucket.icon} />
                  <span className="flex flex-col">
                    <Link
                      href={`/contas/${bucket.id}`}
                      className="link-acao text-texto text-sm hover:underline hover:underline-offset-4"
                    >
                      {bucket.name}
                    </Link>
                    <span className="text-texto-fraco text-xs">em {account.name}</span>
                  </span>
                  {bucket.archived && <Badge tone="previsto">arquivada</Badge>}
                </div>
              </TableCell>
              <TableCell muted className="hidden sm:table-cell">
                Caixinha
              </TableCell>
              <TableCell muted className="hidden md:table-cell">
                <span className="valor text-num-xs">{bucket.transactionCount}</span>
              </TableCell>
              <TableCell value>
                <Amount
                  cents={bucket.balanceCents}
                  size="sm"
                  tone="entrada"
                  sign="negative"
                  masked={valuesHidden}
                />
              </TableCell>
            </tr>
          )),
        ])}
      </tbody>
    </Table>
  );
}

type CreditCardTableProps = {
  accounts: readonly AccountSummary[];
  valuesHidden: boolean;
};

/**
 * Cartão tem tabela própria porque a coluna que importa aqui é outra: fatura, nunca saldo.
 * Limite não aparece nesta lista nem em nenhuma outra tela de visão geral — ele só existe
 * na tela do próprio cartão, com a barra de uso, porque é lá que faz sentido perguntar
 * "quanto ainda posso gastar neste cartão". Aqui do lado do patrimônio, listar o limite ao
 * lado da fatura é o mesmo erro de novo: parece que ele entra na conta.
 */
export function CreditCardTable({ accounts, valuesHidden }: CreditCardTableProps) {
  return (
    <Table caption="Cartões de crédito com fatura atual">
      <thead>
        <tr>
          <TableHeadCell>Cartão</TableHeadCell>
          <TableHeadCell className="hidden md:table-cell">Lançamentos</TableHeadCell>
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
              <TableCell muted className="hidden md:table-cell">
                <span className="valor text-num-xs">{account.transactionCount}</span>
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
