import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";
import type { BudgetProgress, BudgetStatus } from "@/server/budgets/budget.pace";

const STATUS_LABEL: Record<BudgetStatus, string> = {
  dentro: "no ritmo",
  atencao: "acima do ritmo",
  estourado: "estourado",
};

const STATUS_TONE: Record<BudgetStatus, "saida" | "alerta" | "neutro"> = {
  dentro: "neutro",
  atencao: "saida",
  estourado: "alerta",
};

type BudgetBarProps = {
  progress: BudgetProgress;
  masked?: boolean;
};

/**
 * A barra sozinha diria "60% usado", que não significa nada sem o calendário. O marcador
 * de ritmo é o dado que falta: no dia 10 de 30, ele está em 33%, e ver o preenchimento
 * passar dele é o alerta.
 *
 * O estado nunca é só cor: "atenção" ganha hachura além do ocre, e todo estado leva um
 * rótulo escrito.
 */
export function BudgetBar({ progress, masked = false }: BudgetBarProps) {
  const filled = Math.min(Math.max(progress.usedPercent, 0), 100);
  const overflow = progress.usedPercent > 100;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Badge tone={STATUS_TONE[progress.status]}>{STATUS_LABEL[progress.status]}</Badge>
        <span className="valor text-num-xs text-texto-fraco">
          {masked ? "••" : `${Math.round(progress.usedPercent)}% do limite`}
        </span>
      </div>

      <div className="bg-linha relative h-3 overflow-hidden rounded-full">
        <div
          className={cn(
            "h-full rounded-full",
            progress.status === "estourado" ? "bg-alerta-fill" : "bg-saida-fill",
          )}
          style={{
            width: `${filled}%`,
            ...(progress.status === "atencao"
              ? {
                  backgroundImage:
                    "repeating-linear-gradient(135deg, transparent 0 4px, rgb(0 0 0 / 0.22) 4px 8px)",
                }
              : {}),
          }}
        />
        {!overflow && (
          <span
            aria-hidden
            className="bg-texto absolute top-0 h-full w-0.5"
            style={{ left: `${Math.min(progress.pacePercent, 100)}%` }}
          />
        )}
      </div>

      <p className="text-texto-fraco text-xs">
        {masked ? (
          "Valores ocultos."
        ) : (
          <>
            Ritmo esperado até hoje: {Math.round(progress.pacePercent)}% do limite
            {progress.aheadOfPaceCents > 0 && progress.status !== "estourado" && (
              <span className="text-alerta"> · acima do ritmo</span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
