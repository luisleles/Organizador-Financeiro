import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AccountDangerZone } from "@/components/accounts/account-danger-zone";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ACCOUNT_TYPE_LABELS, AccountMark } from "@/components/accounts/account-meta";
import { BalanceSparkline } from "@/components/accounts/balance-sparkline";
import { HideValuesToggle } from "@/components/accounts/hide-values-toggle";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { getAccountDetail } from "@/server/accounts/account.service";
import { readValuesHidden } from "@/server/preferences";
import { deleteAccountAction, setAccountArchivedAction, updateAccountAction } from "../actions";

type ContaPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ContaPage({ params }: ContaPageProps) {
  const { id } = await params;

  const [detail, valuesHidden] = await Promise.all([getAccountDetail(id), readValuesHidden()]);
  if (!detail) notFound();

  const { account, entries, balanceSeries } = detail;
  const available = account.creditCard
    ? account.creditCard.creditLimitCents + account.balanceCents
    : null;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <AccountMark color={account.color} icon={account.icon} />
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl">{account.name}</h1>
            <p className="text-texto-fraco flex items-center gap-2 text-sm">
              {account.institution ?? "Sem instituição"}
              <Badge tone="neutro">{ACCOUNT_TYPE_LABELS[account.type]}</Badge>
              {account.archived && <Badge tone="previsto">arquivada</Badge>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <HideValuesToggle hidden={valuesHidden} />
          <AccountFormDialog action={updateAccountAction} account={account} label="Editar" />
        </div>
      </header>

      <div className={account.creditCard ? "grid gap-6 lg:grid-cols-[2fr_1fr]" : "grid gap-6"}>
        <Card title="Saldo atual">
          <div className="flex flex-col gap-4">
            <Amount
              cents={account.balanceCents}
              size="hero"
              tone={account.balanceCents < 0 ? "alerta" : "neutro"}
              sign="negative"
              showCurrency
              masked={valuesHidden}
            />
            <BalanceSparkline points={balanceSeries} className="h-16 w-full" />
            <dl className="border-linha flex flex-wrap gap-x-8 gap-y-2 border-t pt-3 text-xs">
              <div className="flex items-center gap-2">
                <dt className="text-texto-fraco">Saldo inicial</dt>
                <dd>
                  <Amount
                    cents={account.initialBalanceCents}
                    size="xs"
                    tone="neutro"
                    sign="negative"
                    masked={valuesHidden}
                  />
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-texto-fraco">Lançamentos</dt>
                <dd className="valor text-num-xs">{account.transactionCount}</dd>
              </div>
            </dl>
          </div>
        </Card>

        {account.creditCard && (
          <Card title="Fatura">
            <dl className="flex flex-col gap-3 text-sm">
              <Row label="Fecha no dia">
                <span className="valor text-num-sm">{account.creditCard.closingDay}</span>
              </Row>
              <Row label="Vence no dia">
                <span className="valor text-num-sm">{account.creditCard.dueDay}</span>
              </Row>
              <Row label="Limite">
                <Amount
                  cents={account.creditCard.creditLimitCents}
                  size="sm"
                  tone="neutro"
                  sign="negative"
                  masked={valuesHidden}
                />
              </Row>
              <Row label="Disponível">
                <Amount
                  cents={available ?? 0}
                  size="sm"
                  tone={(available ?? 0) < 0 ? "alerta" : "entrada"}
                  sign="negative"
                  masked={valuesHidden}
                />
              </Row>
            </dl>
          </Card>
        )}
      </div>

      <Card
        title={entries.length > 0 ? `Últimos ${entries.length} lançamentos` : "Extrato"}
        className="overflow-hidden"
      >
        {entries.length === 0 ? (
          <EmptyState
            title="Nenhum lançamento nesta conta"
            description="O saldo é exatamente o saldo inicial que você cadastrou."
          />
        ) : (
          <Table caption={`Extrato de ${account.name}`}>
            <thead>
              <tr>
                <TableHeadCell>Data</TableHeadCell>
                <TableHeadCell>Descrição</TableHeadCell>
                <TableHeadCell className="hidden sm:table-cell">Categoria</TableHeadCell>
                <TableHeadCell value>Valor</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <TableCell muted>
                    <span className="valor text-num-xs">{formatDate(entry.date)}</span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {entry.description}
                      {entry.isTransfer && <Badge tone="neutro">transferência</Badge>}
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
          </Table>
        )}
      </Card>

      <Card title="Zona de risco">
        <AccountDangerZone
          account={account}
          archiveAction={setAccountArchivedAction}
          deleteAction={deleteAccountAction}
        />
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-linha flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
      <dt className="text-texto-fraco">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
