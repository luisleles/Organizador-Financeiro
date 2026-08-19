"use client";

import { cn } from "@/lib/cn";
import { Button } from "./button";

type ErrorStateProps = {
  title?: string;
  description: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = "Não foi possível carregar",
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "border-alerta bg-alerta-suave flex flex-col items-center gap-3 rounded-lg border px-6 py-10 text-center",
        className,
      )}
    >
      <h3 className="font-display text-texto text-xl">{title}</h3>
      <p className="text-texto-fraco max-w-md text-sm">{description}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
