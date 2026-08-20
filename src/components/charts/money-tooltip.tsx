"use client";

import type { ReactNode } from "react";
import { formatBRL } from "@/lib/money";

export type TooltipRow = {
  label: string;
  valueCents: number;
  color?: string;
};

type MoneyTooltipProps = {
  title: string;
  rows: readonly TooltipRow[];
  footer?: ReactNode;
};

/** Todo valor de tooltip sai formatado em BRL — nunca o número cru do eixo. */
export function MoneyTooltip({ title, rows, footer }: MoneyTooltipProps) {
  return (
    <div className="border-linha bg-superficie-alta shadow-elevado rounded-md border px-3 py-2">
      <p className="text-2xs text-texto-fraco font-semibold uppercase">{title}</p>
      <dl className="mt-1.5 flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3 text-xs">
            {row.color && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
            )}
            <dt className="text-texto-fraco">{row.label}</dt>
            <dd className="valor text-texto ml-auto">{formatBRL(row.valueCents)}</dd>
          </div>
        ))}
      </dl>
      {footer && (
        <div className="border-linha text-texto-fraco mt-1.5 border-t pt-1.5 text-xs">{footer}</div>
      )}
    </div>
  );
}
