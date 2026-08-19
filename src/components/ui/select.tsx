import type { Ref, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
};

export function Select({ invalid, className, children, ref, ...props }: SelectProps) {
  return (
    <div className="relative flex items-center">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "bg-superficie text-md text-texto h-10 w-full appearance-none rounded-md border pr-9 pl-3 transition disabled:cursor-not-allowed disabled:opacity-50",
          invalid ? "border-alerta" : "border-linha hover:border-linha-forte",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="text-texto-fraco pointer-events-none absolute right-3 h-3 w-3"
      >
        <path d="M2 4.5 6 8.5 10 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>
  );
}
