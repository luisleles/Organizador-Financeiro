import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import type { ConsolidatedBalance } from "@/server/accounts/account.balance";
import { HideValuesToggle } from "./hide-values-toggle";

type ConsolidatedBalanceCardProps = {
  consolidated: ConsolidatedBalance;
  activeAccountCount: number;
  valuesHidden: boolean;
};

/**
 * Três blocos, não um total só: misturar dívida de cartão com saldo em conta esconde
 * exatamente a informação que faz alguém se enganar sobre quanto tem.
 */
export function ConsolidatedBalanceCard({
  consolidated,
  activeAccountCount,
  valuesHidden,
}: ConsolidatedBalanceCardProps) {
  const { assetsBalanceCents, openInvoicesCents, netWorthCents } = consolidated;

  return (
    <Card title="Patrimônio" action={<HideValuesToggle hidden={valuesHidden} />}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p
            className="text-2xs text-texto-fraco font-semibold uppercase"
            title="Saldo em contas menos faturas de cartão em aberto. Limite de crédito não entra: é crédito do banco, não seu."
          >
            Saldo líquido
          </p>
          <Amount
            cents={netWorthCents}
            size="hero"
            tone={netWorthCents < 0 ? "alerta" : "neutro"}
            sign="negative"
            showCurrency
            masked={valuesHidden}
          />
          <p className="text-texto-fraco text-xs">
            {activeAccountCount} {activeAccountCount === 1 ? "conta ativa" : "contas ativas"}
          </p>
        </div>

        <dl className="border-linha flex gap-8 border-t pt-3 sm:border-t-0 sm:pt-0">
          <div className="flex flex-col gap-1">
            <dt className="text-2xs text-texto-fraco font-semibold uppercase">Saldo em contas</dt>
            <dd>
              <Amount
                cents={assetsBalanceCents}
                size="md"
                tone={assetsBalanceCents < 0 ? "alerta" : "entrada"}
                sign="negative"
                masked={valuesHidden}
              />
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-2xs text-texto-fraco font-semibold uppercase">Faturas em aberto</dt>
            <dd>
              <Amount
                cents={openInvoicesCents}
                size="md"
                tone={openInvoicesCents > 0 ? "saida" : "neutro"}
                sign="never"
                masked={valuesHidden}
              />
            </dd>
          </div>
        </dl>
      </div>
    </Card>
  );
}
