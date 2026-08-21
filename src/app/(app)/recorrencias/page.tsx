import { PageHeader } from "@/components/shell/page-header";
import { BalanceProjectionChart } from "@/components/charts/balance-projection-chart";
import { RecurrenceFormDialog } from "@/components/recurrences/recurrence-form-dialog";
import { DeleteRule, ToggleRule } from "@/components/recurrences/rule-actions";
import { UpcomingList } from "@/components/recurrences/upcoming-list";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableCell, TableHeadCell } from "@/components/ui/table";
import { formatDate } from "@/lib/date";
import { listCategories } from "@/server/categories/category.service";
import { readValuesHidden } from "@/server/preferences";
import { frequencyLabel } from "@/server/recurrences/recurrence.labels";
import {
  PROJECTION_WINDOW_DAYS,
  UPCOMING_WINDOW_DAYS,
  getBalanceProjection,
  listRecurringRules,
  listUpcomingOccurrences,
} from "@/server/recurrences/recurrence.service";
import { listAccounts } from "@/server/accounts/account.service";

export const dynamic = "force-dynamic";

export default async function RecorrenciasPage() {
  const [rules, upcoming, projection, accountList, categories, valuesHidden] = await Promise.all([
    listRecurringRules(),
    listUpcomingOccurrences(),
    getBalanceProjection(),
    listAccounts(),
    listCategories(),
    readValuesHidden(),
  ]);

  // Caixinha não recebe lançamento avulso: quem move meta é a própria meta.
  const accountOptions = accountList.accounts
    .filter((account) => !account.archived)
    .map((account) => ({ id: account.id, name: account.name }));

  const categoryOptions = categories.flat
    .filter((category) => !category.archived)
    .map((category) => ({ id: category.id, name: category.name }));

  const { firstNegative, lowest } = projection;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Recorrências"
        description="O que se repete todo mês vira lançamento sozinho quando você abre o app. A projeção mostra onde esse compromisso todo leva o saldo."
        action={
          <RecurrenceFormDialog
            accounts={accountOptions}
            categories={categoryOptions}
            label="Nova recorrência"
            variant="primary"
          />
        }
      />

      {firstNegative && (
        <p className="border-alerta bg-alerta-suave text-alerta flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-4 py-3 text-sm">
          <span className="font-medium">
            O saldo previsto fica negativo em {formatDate(firstNegative.date)}.
          </span>
          <span className="text-texto-fraco">
            No pior dia do período, {lowest && formatDate(lowest.date)}, ele chega a{" "}
            <Amount
              cents={lowest?.balanceCents ?? 0}
              size="xs"
              tone="alerta"
              sign="negative"
              masked={valuesHidden}
            />
            .
          </span>
        </p>
      )}

      <Card title={`Saldo projetado · ${PROJECTION_WINDOW_DAYS} dias`}>
        <div className="flex flex-col gap-3">
          <p className="text-texto-fraco text-sm">
            Parte do dinheiro livre nas contas — sem o que está guardado em caixinhas — e aplica as
            recorrências e as faturas em aberto no dia do vencimento.
          </p>
          <BalanceProjectionChart days={projection.days} />
        </div>
      </Card>

      <Card title={`Próximos ${UPCOMING_WINDOW_DAYS} dias`}>
        <UpcomingList occurrences={upcoming} valuesHidden={valuesHidden} />
      </Card>

      <Card title="Regras">
        {rules.length === 0 ? (
          <p className="text-texto-fraco text-sm">
            Nenhuma recorrência cadastrada. Salário, aluguel e assinaturas são os candidatos óbvios:
            cadastre uma vez e o app lança sozinho daqui em diante.
          </p>
        ) : (
          <Table caption="Regras de recorrência">
            <thead>
              <tr>
                <TableHeadCell>Descrição</TableHeadCell>
                <TableHeadCell className="hidden sm:table-cell">Quando</TableHeadCell>
                <TableHeadCell className="hidden md:table-cell">Próxima</TableHeadCell>
                <TableHeadCell value>Valor</TableHeadCell>
                <TableHeadCell>
                  <span className="sr-only">Ações</span>
                </TableHeadCell>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-fundo">
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="text-texto text-sm">{rule.description}</span>
                      <span className="text-texto-fraco text-xs">
                        {rule.accountName}
                        {rule.categoryName ? ` · ${rule.categoryName}` : ""}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell muted className="hidden sm:table-cell">
                    <span className="flex items-center gap-2">
                      {frequencyLabel(rule.frequency, rule.interval)}
                      {!rule.active && <Badge tone="previsto">pausada</Badge>}
                    </span>
                  </TableCell>
                  <TableCell muted className="hidden md:table-cell">
                    <span className="valor text-num-xs">
                      {rule.nextOccurrenceAt ? formatDate(rule.nextOccurrenceAt) : "—"}
                    </span>
                  </TableCell>
                  <TableCell value>
                    <Amount
                      cents={rule.type === "INCOME" ? rule.amountCents : -rule.amountCents}
                      size="sm"
                      tone={rule.type === "INCOME" ? "entrada" : "saida"}
                      sign="always"
                      masked={valuesHidden}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center justify-end gap-1">
                      <RecurrenceFormDialog
                        rule={rule}
                        accounts={accountOptions}
                        categories={categoryOptions}
                        label="Editar"
                        variant="ghost"
                        size="sm"
                      />
                      <ToggleRule ruleId={rule.id} active={rule.active} />
                      <DeleteRule ruleId={rule.id} />
                    </span>
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
