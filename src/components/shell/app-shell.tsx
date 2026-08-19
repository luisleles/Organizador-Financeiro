import { Suspense, type ReactNode } from "react";
import { BarNav } from "./bar-nav";
import { PeriodBarNav, PeriodRailNav } from "./period-nav";
import { RailNav } from "./rail-nav";
import { TopBar } from "./top-bar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen">
      <a
        href="#conteudo"
        className="bg-tinta text-tinta-avesso sr-only rounded-md px-4 py-2 text-sm focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50"
      >
        Pular para o conteúdo
      </a>

      <div className="border-linha hidden w-56 shrink-0 border-r md:block">
        <div className="sticky top-0 h-screen overflow-y-auto">
          <Suspense fallback={<RailNav query="" />}>
            <PeriodRailNav />
          </Suspense>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="conteudo" className="flex-1 px-4 pt-6 pb-28 sm:px-8 md:pb-12">
          {children}
        </main>
      </div>

      <Suspense fallback={<BarNav query="" />}>
        <PeriodBarNav />
      </Suspense>
    </div>
  );
}
