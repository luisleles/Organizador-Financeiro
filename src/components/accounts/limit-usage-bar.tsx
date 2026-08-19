import { cn } from "@/lib/cn";
import { isLimitAlert } from "@/server/accounts/account.credit-card";

type LimitUsageBarProps = {
  percent: number;
  masked?: boolean;
  className?: string;
};

export function LimitUsageBar({ percent, masked = false, className }: LimitUsageBarProps) {
  const alert = isLimitAlert(percent);
  const rounded = Math.round(percent);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xs text-texto-fraco font-semibold uppercase">Uso do limite</span>
        <span className={cn("valor text-num-xs", alert ? "text-alerta" : "text-texto")}>
          {masked ? "••" : `${rounded}%`}
        </span>
      </div>
      <div
        className="bg-linha h-2 overflow-hidden rounded-full"
        role="img"
        aria-label={`${rounded}% do limite usado`}
      >
        <div
          className={cn("h-full rounded-full", alert ? "bg-alerta-fill" : "bg-saida-fill")}
          style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }}
        />
      </div>
      {alert && !masked && (
        <p className="text-alerta text-xs">
          Acima de 80% do limite. O que sobra não é seu dinheiro, é crédito.
        </p>
      )}
    </div>
  );
}
