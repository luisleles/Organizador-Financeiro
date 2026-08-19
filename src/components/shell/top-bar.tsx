import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PeriodPicker } from "./period-picker";

export function TopBar() {
  return (
    <header className="border-linha bg-fundo/85 sticky top-0 z-30 flex min-h-14 items-center gap-4 border-b px-4 py-2 backdrop-blur sm:px-8">
      <Suspense fallback={<Skeleton className="h-8 w-64" />}>
        <PeriodPicker />
      </Suspense>
    </header>
  );
}
