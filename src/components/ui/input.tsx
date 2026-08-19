import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  ref?: Ref<HTMLInputElement>;
  invalid?: boolean;
  /** Alinha à direita e usa a fonte tabular — obrigatório em campo de valor. */
  numeric?: boolean;
  prefix?: string;
};

export function Input({ ref, invalid, numeric, prefix, className, ...props }: InputProps) {
  return (
    <div className="relative flex items-center">
      {prefix && (
        <span className="text-texto-fraco pointer-events-none absolute left-3 text-xs">
          {prefix}
        </span>
      )}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "bg-superficie text-md text-texto placeholder:text-texto-fraco h-10 w-full rounded-md border px-3 transition disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-alerta" : "border-linha hover:border-linha-forte",
          numeric && "valor text-num-md text-right",
          prefix && "pl-9",
          className,
        )}
        {...props}
      />
    </div>
  );
}
