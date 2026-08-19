"use client";

import { useSearchParams } from "next/navigation";
import { parsePeriod, periodQuery } from "@/lib/period";
import { BarNav } from "./bar-nav";
import { RailNav } from "./rail-nav";

/**
 * Os links carregam o período para que trocar de tela não perca o recorte escolhido.
 * Enquanto o Suspense não resolve, a mesma navegação é servida sem a query — o HTML
 * estático já sai navegável, sem esqueleto piscando no lugar do menu.
 */
export function PeriodRailNav() {
  return <RailNav query={periodQuery(parsePeriod(useSearchParams()))} />;
}

export function PeriodBarNav() {
  return <BarNav query={periodQuery(parsePeriod(useSearchParams()))} />;
}
