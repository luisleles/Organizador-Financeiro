"use client";

import { NAV_GROUPS } from "@/lib/navigation";
import { NavLink } from "./nav-link";

type RailNavProps = {
  query: string;
};

export function RailNav({ query }: RailNavProps) {
  return (
    <div className="flex flex-col gap-6 py-5">
      <p className="font-display px-5 text-lg leading-none">
        Controle
        <br />
        Financeiro
      </p>

      <nav aria-label="Navegação principal" className="flex flex-col gap-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-1">
            <h2 className="text-2xs text-texto-fraco px-5 pb-1 font-semibold uppercase">
              {group.title}
            </h2>
            {group.items.map((item) => (
              <NavLink key={item.href} item={item} query={query} variant="rail" />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
