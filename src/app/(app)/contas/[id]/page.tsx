import { notFound } from "next/navigation";
import Link from "next/link";
import { AccountDangerZone } from "@/components/accounts/account-danger-zone";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { ACCOUNT_TYPE_LABELS, AccountMark } from "@/components/accounts/account-meta";
import { BalanceSparkline } from "@/components/accounts/balance-sparkline";
import { CreditCardPanel } from "@/components/accounts/credit-card-panel";
import { HideValuesToggle } from "@/components/accounts/hide-values-toggle";
import { InvoiceStatement } from "@/components/accounts/invoice-statement";
import { InvoicePaymentDialog } from "@/components/accounts/invoice-payment-dialog";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { formatDate, toDateParts } from "@/lib/date";
import { isLimitAlert } from "@/server/accounts/account.credit-card";
import { getAccountDetail, listAssetAccountOptions } from "@/server/accounts/account.service";
import { readValuesHidden } from "@/server/preferences";
import { deleteAccountAction, setAccountArchivedAction, updateAccountAction } from "../actions";

type ContaPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fatura?: string }>;
};

export default async function ContaPage({ params, searchParams }: ContaPageProps) {
  const { id } = await params;
  const { fatura } = await searchParams;

  const [detail, valuesHidden, assetAccounts] = await Promise.all([
    getAccountDetail(id),
    readValuesHidden(),
    listAssetAccountOptions(),
  ]);
  if (!detail) notFound();

  const { account, entries, balanceSeries, invoices } = detail;
  const card = account.creditCard;
  const selectedInvoice = invoices
    ? (invoices.find((invoice) => invoice.id === fatura) ??
      invoices.find((invoice) => invoice.closingDate.getTime() === card?.closingDate.getTime()) ??
      invoices.find(
        (invoice) => invoice.paymentStatus !== "PAID" && invoice.paymentStatus !== "OVERPAID",
      ) ??
      invoices[0])
    : undefined;
  const selectedIndex = selectedInvoice && invoices ? invoices.indexOf(selectedInvoice) : -1;
  const selectedDebtCents = selectedInvoice ? Math.max(0, -selectedInvoice.totalCents) : 0;

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
        <Card title={card ? invoiceTitle(selectedInvoice?.referenceMonth) : "Saldo atual"}>
          <div className="flex flex-col gap-4">
            {/* Cartão não tem saldo: o número principal é o quanto se deve. */}
            <Amount
              cents={card ? selectedDebtCents : account.balanceCents}
              size="hero"
              tone={cardTone(card, card ? -selectedDebtCents : account.balanceCents)}
              sign={card ? "never" : "negative"}
              showCurrency
              masked={valuesHidden}
            />
            <BalanceSparkline
              points={balanceSeries}
              tone={card ? (isLimitAlert(card.limitUsagePercent) ? "alerta" : "saida") : "auto"}
              className="h-16 w-full"
              ariaLabel={card ? "Evolução das faturas no período carregado" : undefined}
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
        title={
          invoices
            ? "Lançamentos da fatura"
            : entries.length > 0
              ? `Últimos ${entries.length} lançamentos`
              : "Extrato"
        }
        action={
          selectedInvoice ? (
            <div className="flex flex-wrap items-center gap-2">
              {selectedIndex >= 0 && invoices?.[selectedIndex + 1] && (
                <Link
                  className="text-texto-fraco hover:text-texto text-xs"
                  href={`?fatura=${invoices[selectedIndex + 1].id}`}
                >
                  ← Anterior
                </Link>
              )}
              {selectedIndex > 0 && invoices?.[selectedIndex - 1] && (
                <Link
                  className="text-texto-fraco hover:text-texto text-xs"
                  href={`?fatura=${invoices[selectedIndex - 1].id}`}
                >
                  Próxima →
                </Link>
              )}
              <InvoicePaymentDialog
                invoiceId={selectedInvoice.id}
                outstandingCents={selectedDebtCents}
                accounts={assetAccounts}
                today={todayISO()}
                disabled={selectedDebtCents === 0}
              />
            </div>
          ) : undefined
        }
        className="overflow-hidden"
      >
        {entries.length === 0 ? (
          <EmptyState
            title={card ? "Nenhum lançamento neste cartão" : "Nenhum lançamento nesta conta"}
            description={
              card
                ? "As faturas serão criadas quando você lançar a primeira compra."
                : "O saldo é exatamente o saldo inicial que você cadastrou."
            }
          />
        ) : invoices && selectedInvoice ? (
          <InvoiceStatement
            invoices={[selectedInvoice]}
            accountName={account.name}
            valuesHidden={valuesHidden}
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

      {invoices && card && (
        <Card title="Parcelas comprometidas nos próximos meses">
          <FutureInstallments
            invoices={invoices}
            currentReferenceMonth={selectedInvoice?.referenceMonth ?? new Date()}
            valuesHidden={valuesHidden}
          />
        </Card>
      )}

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

function invoiceTitle(referenceMonth?: Date): string {
  if (!referenceMonth) return "Fatura atual";
  return `Fatura de ${new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(referenceMonth)}`;
}

function FutureInstallments({
  invoices,
  currentReferenceMonth,
  valuesHidden,
}: {
  invoices: NonNullable<Awaited<ReturnType<typeof getAccountDetail>>>["invoices"];
  currentReferenceMonth: Date;
  valuesHidden: boolean;
}) {
  const future = (invoices ?? [])
    .filter((invoice) => invoice.referenceMonth > currentReferenceMonth)
    .map((invoice) => ({
      ...invoice,
      committedCents: invoice.entries
        .filter((entry) => entry.installmentNumber !== null && entry.amountCents < 0)
        .reduce((total, entry) => total + Math.abs(entry.amountCents), 0),
    }))
    .filter((invoice) => invoice.committedCents > 0)
    .sort((left, right) => left.referenceMonth.getTime() - right.referenceMonth.getTime());

  if (future.length === 0) {
    return <p className="text-texto-fraco text-sm">Nenhuma parcela futura comprometida.</p>;
  }
  return (
    <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {future.map((invoice) => (
        <div
          key={invoice.id}
          className="border-linha flex items-center justify-between rounded-md border p-3"
        >
          <dt className="text-sm capitalize">
            {invoiceTitle(invoice.referenceMonth).replace("Fatura de ", "")}
          </dt>
          <dd>
            <Amount cents={invoice.committedCents} size="sm" sign="never" masked={valuesHidden} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function todayISO(): string {
  const { year, month, day } = toDateParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Dívida dentro do limite é ocre; carmim fica reservado para o limite quase no fim. */
function cardTone(
  card: { limitUsagePercent: number } | null,
  balanceCents: number,
): "alerta" | "saida" | "neutro" {
  if (!card) return balanceCents < 0 ? "alerta" : "neutro";
  if (balanceCents === 0) return "neutro";
  return isLimitAlert(card.limitUsagePercent) ? "alerta" : "saida";
}
