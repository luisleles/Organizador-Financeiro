import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("bg-linha animate-pulse rounded-sm", className)} />;
}

type SkeletonRowsProps = {
  rows?: number;
};

/** Espelha a grade do extrato para que a coluna de valores não pule quando os dados chegam. */
export function SkeletonRows({ rows = 4 }: SkeletonRowsProps) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="border-linha flex items-center border-b last:border-b-0">
          <div className="flex flex-1 flex-col gap-1.5 py-3 pr-4">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2 w-1/4 opacity-60" />
          </div>
          <div className="border-linha w-32 shrink-0 border-l py-3 pl-4">
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
