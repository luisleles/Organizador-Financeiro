import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ArchiveGoalButton } from "@/components/goals/archive-goal-button";
import { BucketPanel, CreateBucketPanel } from "@/components/goals/bucket-panel";
import { GoalFormDialog } from "@/components/goals/goal-form-dialog";
import { GoalMark } from "@/components/goals/goal-icon";
import { GoalProgressChart } from "@/components/goals/goal-progress-chart";
import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { formatDate, toDateParts } from "@/lib/date";
import { monthKey } from "@/server/categories/category.stats";
import { listGoals } from "@/server/goals/goal.service";
import type { GoalDetail } from "@/server/goals/goal.types";
import { readValuesHidden } from "@/server/preferences";
import { listAccountBalances } from "@/server/reports/report.service";

export const dynamic = "force-dynamic";

export default async function MetasPage() {
  const [{ planning, active, completed, archived }, accounts, valuesHidden] = await Promise.all([
    listGoals(),
    listAccountBalances(),
    readValuesHidden(),
  ]);

  // Caixinha só pode nascer sob conta de ativo que não seja outra caixinha.
  const accountOptions = accounts
    .filter((account) => !account.isCreditCard && !account.isBucket)
    .map((account) => ({ id: account.id, name: account.name }));
  const today = todayISO();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Metas"
        description="A curva mostra o que já foi guardado e, tracejada, para onde o ritmo dos últimos 3 meses leva. Onde ela cruza o alvo é a data real de conclusão."
        action={<GoalFormDialog accounts={accountOptions} label="Nova meta" variant="primary" />}
      />

      {planning.length === 0 &&
      active.length === 0 &&
      completed.length === 0 &&
      archived.length === 0 ? (
        <EmptyState
          title="Nenhuma meta ainda"
          description="Uma meta dá destino para a sobra do mês: um valor, um prazo, e o app calcula o resto."
          action={
            <GoalFormDialog accounts={accountOptions} label="Criar a primeira" variant="primary" />
          }
        />
      ) : (
        <>
          {completed.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-2xs text-texto-fraco font-semibold uppercase">Concluídas</h2>
              {completed.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  accounts={accountOptions}
                  today={today}
                  valuesHidden={valuesHidden}
                />
              ))}
            </section>
          )}

          {planning.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-2xs text-texto-fraco font-semibold uppercase">Em planejamento</h2>
              {planning.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  accounts={accountOptions}
                  today={today}
                  valuesHidden={valuesHidden}
                />
              ))}
            </section>
          )}

          {active.length > 0 && (
            <section className="flex flex-col gap-4">
              <h2 className="text-2xs text-texto-fraco font-semibold uppercase">Em andamento</h2>
              {active.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  accounts={accountOptions}
                  today={today}
                  valuesHidden={valuesHidden}
                />
              ))}
            </section>
          )}

          {archived.length > 0 && (
            <Card title="Arquivadas">
              <ul className="flex flex-col gap-1">
                {archived.map((goal) => (
                  <li
                    key={goal.id}
                    className="border-linha flex flex-wrap items-center gap-3 rounded-md border border-dashed px-3 py-2"
                  >
                    <span className="text-texto-fraco text-sm">{goal.name}</span>
                    <span className="valor text-num-xs text-texto-fraco">
                      {Math.round(goal.pace.percent)}%
                    </span>
                    <div className="ml-auto">
                      <ArchiveGoalButton goalId={goal.id} archived />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

type GoalCardProps = {
  goal: GoalDetail;
  accounts: readonly { id: string; name: string }[];
  today: string;
  valuesHidden: boolean;
};

function GoalCard({ goal, accounts, today, valuesHidden }: GoalCardProps) {
  const { pace } = goal;
  const late = pace.monthsLate !== null && pace.monthsLate > 0;

  return (
    <section
      className={cn(
        "rounded-lg border",
        pace.completed ? "border-entrada bg-entrada-suave" : "border-linha bg-superficie",
      )}
    >
      <header className="border-linha flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <GoalMark color={goal.color} icon={goal.icon} />
        <div className="flex flex-col gap-0.5">
          <h3 className="text-texto text-sm font-medium">{goal.name}</h3>
          <p className="text-texto-fraco flex items-center gap-2 text-xs">
            Prazo {formatDate(goal.targetDate)}
            {goal.bucket ? (
              <Badge tone="neutro">caixinha em {goal.bucket.parentAccountName}</Badge>
            ) : (
              <Badge tone="previsto">sem caixinha</Badge>
            )}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {pace.completed ? (
            <Badge tone="entrada">concluída</Badge>
          ) : late ? (
            <Badge tone="alerta">
              {pace.monthsLate === 1 ? "1 mês atrasada" : `${pace.monthsLate} meses atrasada`}
            </Badge>
          ) : pace.projectedDate ? (
            <Badge tone="saida">no ritmo</Badge>
          ) : (
            <Badge tone="previsto">sem ritmo</Badge>
          )}
          <GoalFormDialog
            goal={goal}
            accounts={accounts}
            label="Editar"
            variant="ghost"
            size="sm"
          />
          <ArchiveGoalButton goalId={goal.id} archived={goal.archived} />
        </div>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-2xs text-texto-fraco font-semibold uppercase">Guardado</p>
            <Amount
              cents={pace.savedCents}
              size="lg"
              tone={pace.completed ? "entrada" : "neutro"}
              sign="never"
              showCurrency
              masked={valuesHidden}
            />
            {goal.bucket && goal.bucket.totalYieldCents > 0 && (
              <p className="text-texto-fraco text-xs">
                <Amount
                  cents={goal.bucket.totalDepositedCents}
                  size="xs"
                  tone="neutro"
                  sign="never"
                  masked={valuesHidden}
                />{" "}
                aportado +{" "}
                <Amount
                  cents={goal.bucket.totalYieldCents}
                  size="xs"
                  tone="entrada"
                  sign="never"
                  masked={valuesHidden}
                />{" "}
                de rendimento
              </p>
            )}
            <p className="text-texto-fraco text-xs">
              de{" "}
              <Amount
                cents={goal.targetCents}
                size="xs"
                tone="neutro"
                sign="never"
                masked={valuesHidden}
              />{" "}
              · <span className="valor">{Math.round(pace.percent)}%</span>
            </p>
          </div>

          {pace.completed ? (
            <p className="text-entrada text-sm font-medium">Alvo alcançado.</p>
          ) : (
            <dl className="flex flex-wrap gap-x-8 gap-y-2">
              <Figure label="Falta">
                <Amount
                  cents={pace.remainingCents}
                  size="md"
                  tone="saida"
                  sign="never"
                  masked={valuesHidden}
                />
              </Figure>
              <Figure label="Precisa guardar por mês">
                <Amount
                  cents={pace.requiredPerMonthCents ?? 0}
                  size="md"
                  tone={
                    pace.recentPacePerMonthCents < (pace.requiredPerMonthCents ?? 0)
                      ? "alerta"
                      : "entrada"
                  }
                  sign="never"
                  masked={valuesHidden}
                />
              </Figure>
              <Figure label="Ritmo de 3 meses">
                <Amount
                  cents={pace.recentPacePerMonthCents}
                  size="md"
                  tone="neutro"
                  sign="never"
                  masked={valuesHidden}
                />
              </Figure>
            </dl>
          )}
        </div>

        <GoalProgressChart
          series={goal.series}
          targetCents={pace.targetCents}
          deadlineMonth={monthKey(toDateParts(goal.targetDate))}
          late={late}
        />

        {!pace.completed && (
          <p className="text-texto-fraco text-xs">
            {pace.projectedDate ? (
              <>
                No ritmo atual, a meta fecha em{" "}
                <span className={cn("valor", late && "text-alerta")}>
                  {formatMonthYear(pace.projectedDate)}
                </span>
                {late
                  ? ` — ${pace.monthsLate} ${pace.monthsLate === 1 ? "mês" : "meses"} depois do prazo.`
                  : pace.monthsLate !== null && pace.monthsLate < 0
                    ? ` — ${Math.abs(pace.monthsLate)} ${Math.abs(pace.monthsLate) === 1 ? "mês" : "meses"} antes do prazo.`
                    : " — bem em cima do prazo."}
              </>
            ) : (
              "Sem aportes nos últimos 3 meses, não dá para projetar uma data de conclusão."
            )}
            {pace.deadlinePassed && <span className="text-alerta"> O prazo já venceu.</span>}
          </p>
        )}

        {goal.bucket ? (
          <BucketPanel goal={goal} today={today} />
        ) : (
          <CreateBucketPanel goalId={goal.id} accounts={accounts} />
        )}
      </div>
    </section>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-2xs text-texto-fraco font-semibold uppercase">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatMonthYear(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function todayISO(): string {
  const { year, month, day } = toDateParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
