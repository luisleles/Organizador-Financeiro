import { notFound } from "next/navigation";
import { AccountDangerZone } from "@/components/accounts/account-danger-zone";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ACCOUNT_TYPE_LABELS, AccountMark } from "@/components/accounts/account-meta";
import { BalanceSparkline } from "@/components/accounts/balance-sparkline";
import { CreditCardPanel } from "@/components/accounts/credit-card-panel";
import { HideValuesToggle } from "@/components/accounts/hide-values-toggle";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { isLimitAlert } from "@/server/accounts/account.credit-card";
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
  const card = account.creditCard;

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

      <div className={card ? "grid gap-6 lg:grid-cols-[2fr_1fr]" : "grid gap-6"}>
        <Card title={card ? "Fatura atual" : "Saldo atual"}>
          <div className="flex flex-col gap-4">
            {/* Cartão não tem saldo: o número principal é o quanto se deve. */}
            <Amount
              cents={card ? Math.abs(card.currentDebtCents) : account.balanceCents}
              size="hero"
              tone={cardTone(card, account.balanceCents)}
              sign={card ? "never" : "negative"}
              showCurrency
              masked={valuesHidden}
            />
            <BalanceSparkline
              points={balanceSeries}
              tone={card ? (isLimitAlert(card.limitUsagePercent) ? "alerta" : "saida") : "auto"}
              className="h-16 w-full"
            />
            <dl className="border-linha flex flex-wrap gap-x-8 gap-y-2 border-t pt-3 text-xs">
              {card ? (
                <div className="flex items-center gap-2">
                  <dt className="text-texto-fraco">Limite disponível</dt>
                  <dd>
                    <Amount
                      cents={card.availableLimitCents}
                      size="xs"
                      tone={card.availableLimitCents < 0 ? "alerta" : "entrada"}
                      sign="negative"
                      masked={valuesHidden}
                    />
                  </dd>
                </div>
              ) : (
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
              )}
              {card && card.creditBalanceCents > 0 && (
                <div className="flex items-center gap-2">
                  <dt className="text-texto-fraco">Crédito a favor</dt>
                  <dd>
                    <Amount
                      cents={card.creditBalanceCents}
                      size="xs"
                      tone="entrada"
                      sign="never"
                      masked={valuesHidden}
                    />
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-2">
                <dt className="text-texto-fraco">Lançamentos</dt>
                <dd className="valor text-num-xs">{account.transactionCount}</dd>
              </div>
            </dl>
          </div>
        </Card>

        {card && <CreditCardPanel card={card} valuesHidden={valuesHidden} />}
      </div>

      <Card
        title={entries.length > 0 ? `Últimos ${entries.length} lançamentos` : "Extrato"}
        className="overflow-hidden"
      >
        {entries.length === 0 ? (
          <EmptyState
            title={card ? "Nenhum lançamento neste cartão" : "Nenhum lançamento nesta conta"}
            description={
              card
                ? "A fatura é exatamente o valor inicial que você cadastrou."
                : "O saldo é exatamente o saldo inicial que você cadastrou."
            }
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

/** Dívida dentro do limite é ocre; carmim fica reservado para o limite quase no fim. */
function cardTone(
  card: { limitUsagePercent: number; currentDebtCents: number } | null,
  balanceCents: number,
): "alerta" | "saida" | "neutro" {
  if (!card) return balanceCents < 0 ? "alerta" : "neutro";
  if (card.currentDebtCents === 0) return "neutro";
  return isLimitAlert(card.limitUsagePercent) ? "alerta" : "saida";
}
