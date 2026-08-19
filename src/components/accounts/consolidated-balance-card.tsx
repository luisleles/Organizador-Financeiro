import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import type { ConsolidatedBalance } from "@/server/accounts/account.balance";
import { HideValuesToggle } from "./hide-values-toggle";

type ConsolidatedBalanceCardProps = {
  consolidated: ConsolidatedBalance;
  activeAccountCount: number;
  valuesHidden: boolean;
};

export function ConsolidatedBalanceCard({
  consolidated,
  activeAccountCount,
  valuesHidden,
}: ConsolidatedBalanceCardProps) {
  return (
    <Card title="Patrimônio" action={<HideValuesToggle hidden={valuesHidden} />}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-2xs text-texto-fraco font-semibold uppercase">Saldo consolidado</p>
          <Amount
            cents={consolidated.totalCents}
            size="hero"
            tone={consolidated.totalCents < 0 ? "alerta" : "neutro"}
            sign="negative"
            showCurrency
            masked={valuesHidden}
          />
          <p className="text-texto-fraco text-xs">
            {activeAccountCount} {activeAccountCount === 1 ? "conta ativa" : "contas ativas"}
          </p>
        </div>

        <dl className="flex gap-8">
          <div className="flex flex-col gap-1">
            <dt className="text-2xs text-texto-fraco font-semibold uppercase">Ativos</dt>
            <dd>
              <Amount
                cents={consolidated.assetsCents}
                size="md"
                tone="entrada"
                sign="negative"
                masked={valuesHidden}
              />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-2xs text-texto-fraco font-semibold uppercase">Passivos</dt>
            <dd>
              <Amount
                cents={consolidated.liabilitiesCents}
                size="md"
                tone={consolidated.liabilitiesCents > 0 ? "saida" : "neutro"}
                sign="negative"
                masked={valuesHidden}
              />
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
