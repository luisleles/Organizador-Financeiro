"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { parsePeriod, periodQuery } from "@/lib/period";
import { BarNav } from "./bar-nav";
import { RailNav } from "./rail-nav";

/** Os links carregam o período para que trocar de tela não perca o recorte escolhido. */
export function PeriodRailNav() {
  const pathname = usePathname();
  return <RailNav query={periodQuery(parsePeriod(useSearchParams()))} pathname={pathname} />;
}

export function PeriodBarNav() {
  return <BarNav query={periodQuery(parsePeriod(useSearchParams()))} />;
}
