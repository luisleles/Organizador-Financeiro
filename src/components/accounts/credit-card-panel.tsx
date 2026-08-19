import type { ReactNode } from "react";
import { Amount } from "@/components/ui/amount";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/date";
import type { CreditCardStatus } from "@/server/accounts/account.types";
import { LimitUsageBar } from "./limit-usage-bar";

type CreditCardPanelProps = {
  card: CreditCardStatus;
  valuesHidden: boolean;
};

export function CreditCardPanel({ card, valuesHidden }: CreditCardPanelProps) {
  return (
    <Card title="Ciclo da fatura">
      <div className="flex flex-col gap-4">
        <LimitUsageBar percent={card.limitUsagePercent} masked={valuesHidden} />

        <dl className="flex flex-col gap-2 text-sm">
          <Row label="Fecha">
            <span className="flex items-baseline gap-2">
              <span className="text-texto-fraco text-xs">
                {closingLabel(card.daysUntilClosing)}
              </span>
              <span className="valor text-num-sm">{formatDate(card.closingDate)}</span>
            </span>
          </Row>
          <Row label="Vence">
            <span className="valor text-num-sm">{formatDate(card.dueDate)}</span>
          </Row>
          <Row label="Limite disponível">
            <Amount
              cents={card.availableLimitCents}
              size="sm"
              tone={card.availableLimitCents < 0 ? "alerta" : "entrada"}
              sign="negative"
              masked={valuesHidden}
            />
          </Row>
          <Row label="Limite total">
            <Amount
              cents={card.creditLimitCents}
              size="sm"
              tone="neutro"
              sign="never"
              masked={valuesHidden}
            />
          </Row>
        </dl>
      </div>
    </Card>
  );
}

function closingLabel(daysUntilClosing: number): string {
  if (daysUntilClosing === 0) return "hoje";
  if (daysUntilClosing === 1) return "amanhã";
  return `em ${daysUntilClosing} dias`;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-linha flex items-center justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
      <dt className="text-texto-fraco">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
