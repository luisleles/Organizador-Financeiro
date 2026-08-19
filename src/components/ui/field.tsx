import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type FieldProps = {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
};

export function Field({ label, htmlFor, hint, error, children, className }: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-2xs text-texto-fraco font-semibold uppercase">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-alerta text-xs">{error}</p>
      ) : (
        hint && <p className="text-texto-fraco text-xs">{hint}</p>
      )}
    </div>
  );
}
