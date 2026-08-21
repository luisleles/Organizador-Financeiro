"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Os gráficos do painel entram sob demanda. O Recharts é o maior pedaço de JavaScript da
 * página e vive abaixo da dobra: adiar o carregamento tira esse peso do caminho crítico e
 * deixa o topo — que é o que a pessoa lê primeiro — interativo antes.
 *
 * A altura do esqueleto é a mesma do gráfico, para a página não pular quando ele chega.
 */
const espera = (altura: string) =>
  function EsperandoGrafico() {
    return <Skeleton className={`w-full ${altura}`} />;
  };

export const LazyCategoryBars = dynamic(
  () => import("./category-bars").then((mod) => mod.CategoryBars),
  { loading: espera("h-[260px]"), ssr: false },
);

export const LazyBalanceEvolutionChart = dynamic(
  () => import("./balance-evolution-chart").then((mod) => mod.BalanceEvolutionChart),
  { loading: espera("h-[220px]"), ssr: false },
);
