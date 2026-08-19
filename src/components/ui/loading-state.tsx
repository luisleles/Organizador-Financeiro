import { Card } from "./card";
import { Skeleton, SkeletonRows } from "./skeleton";

type LoadingStateProps = {
  rows?: number;
  label?: string;
};

/** Reproduz a moldura da página — cabeçalho e grade de valores — para nada saltar ao carregar. */
export function LoadingState({ rows = 5, label = "Carregando" }: LoadingStateProps) {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite" aria-busy>
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 opacity-60" />
      </div>
      <Card>
        <SkeletonRows rows={rows} />
      </Card>
    </div>
  );
}
