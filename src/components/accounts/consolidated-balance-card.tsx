import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import type { ConsolidatedBalance } from "@/server/accounts/account.balance";
import { HideValuesToggle } from "./hide-values-toggle";

type ConsolidatedBalanceCardProps = {
  consolidated: ConsolidatedBalance;
  /** Soma do que os cartões ativos já lançaram na fatura que ainda vai fechar. */
  dueAtNextClosingCents: number;
  activeAccountCount: number;
  valuesHidden: boolean;
};

/**
 * Dois blocos, não um total só: misturar dívida de cartão com saldo em conta esconde
 * exatamente a informação que faz alguém se enganar sobre quanto tem. Não existe um
 * terceiro número que junte os dois — quem quiser o líquido soma de cabeça.
 */
export function ConsolidatedBalanceCard({
  consolidated,
  dueAtNextClosingCents,
  activeAccountCount,
  valuesHidden,
}: ConsolidatedBalanceCardProps) {
  const { assetsBalanceCents, openInvoicesCents } = consolidated;

  return (
    <Card title="Saldo" action={<HideValuesToggle hidden={valuesHidden} />}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p
            className="text-2xs text-texto-fraco font-semibold uppercase"
            title="Soma de toda conta que não é cartão de crédito. Limite de crédito não entra: é crédito do banco, não seu."
          >
            Saldo em contas
          </p>
          <Amount
            cents={assetsBalanceCents}
            size="hero"
            tone={assetsBalanceCents < 0 ? "alerta" : "neutro"}
            sign="negative"
            showCurrency
            masked={valuesHidden}
          />
          <p className="text-texto-fraco text-xs">
            {activeAccountCount} {activeAccountCount === 1 ? "conta ativa" : "contas ativas"}
          </p>
        </div>

        <div className="border-linha flex flex-col gap-1 border-t pt-3 sm:border-t-0 sm:pt-0">
          <dt
            className="text-2xs text-texto-fraco font-semibold uppercase"
            title="Dívida em aberto nos cartões de crédito, exibida como valor positivo."
          >
            Faturas em aberto (dívida)
          </dt>
          <dd>
            <Amount
              cents={openInvoicesCents}
              size="md"
              tone={openInvoicesCents > 0 ? "alerta" : "neutro"}
              sign="never"
              masked={valuesHidden}
            />
          </dd>
          {dueAtNextClosingCents > 0 && (
            <p className="text-texto-fraco text-xs">
              Vence no próximo fechamento:{" "}
              <Amount
                cents={dueAtNextClosingCents}
                size="xs"
                tone="neutro"
                sign="never"
                masked={valuesHidden}
              />
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
