"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatBRL } from "@/lib/money";
import { evaluateAmountExpression } from "@/server/transactions/transaction.amount";

const HAS_OPERATOR = /[+*]|.-/;

type AmountInputProps = {
  id: string;
  name: string;
  defaultValue?: string;
  invalid?: boolean;
  autoFocus?: boolean;
};

/** Mostra o resultado da conta enquanto se digita: "12,50+8" vira "= R$ 20,50" embaixo. */
export function AmountInput({ id, name, defaultValue = "", invalid, autoFocus }: AmountInputProps) {
  const [raw, setRaw] = useState(defaultValue);
  const previewId = useId();
  const preview = HAS_OPERATOR.test(raw) ? evaluate(raw) : null;

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        name={name}
        numeric
        prefix="R$"
        inputMode="text"
        autoComplete="off"
        placeholder="0,00"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        invalid={invalid}
        autoFocus={autoFocus}
        aria-describedby={preview ? previewId : undefined}
      />
      {preview && (
        <p id={previewId} className="valor text-num-xs text-texto-fraco text-right">
          = {preview}
        </p>
      )}
    </div>
  );
}

function evaluate(raw: string): string | null {
  try {
    return formatBRL(Math.abs(evaluateAmountExpression(raw)));
  } catch {
    return null;
  }
}
