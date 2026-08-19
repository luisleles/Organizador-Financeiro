"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { NAV_ITEMS, PRIMARY_NAV_HREFS, isActive } from "@/lib/navigation";
import { NavIcon } from "./nav-icon";
import { NavLink } from "./nav-link";

const primaryItems = NAV_ITEMS.filter((item) => PRIMARY_NAV_HREFS.includes(item.href));
const secondaryItems = NAV_ITEMS.filter((item) => !PRIMARY_NAV_HREFS.includes(item.href));

type BarNavProps = {
  query: string;
};

export function BarNav({ query }: BarNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);

  const secondaryActive = secondaryItems.some((item) => isActive(pathname, item.href));

  useEffect(() => setSheetOpen(false), [pathname]);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    if (sheetOpen && !sheet.open) sheet.showModal();
    if (!sheetOpen && sheet.open) sheet.close();
  }, [sheetOpen]);

  return (
    <>
      <nav
        aria-label="Navegação principal"
        className="border-linha bg-superficie fixed inset-x-0 bottom-0 z-40 flex items-stretch gap-1 border-t px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        {primaryItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            query={query}
            variant="bar"
            active={isActive(pathname, item.href)}
          />
        ))}
        <button
          type="button"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
          className={cn(
            "text-2xs flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-2 font-semibold transition",
            secondaryActive ? "text-texto" : "text-texto-fraco",
          )}
        >
          <NavIcon name="configuracoes" className="h-5 w-5" />
          <span className="w-full truncate text-center">Mais</span>
        </button>
      </nav>

      <dialog
        ref={sheetRef}
        onClose={() => setSheetOpen(false)}
        aria-label="Mais seções"
        className="border-linha bg-superficie-alta text-texto shadow-elevado mx-auto mt-auto mb-0 w-full max-w-none rounded-t-lg border-t"
      >
        <div className="flex flex-col gap-1 px-2 pt-3 pb-6">
          <span aria-hidden className="bg-linha-forte mx-auto mb-2 h-1 w-10 rounded-full" />
          {secondaryItems.map((item) => (
            <Link
              key={item.href}
              href={`${item.href}${query}`}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              className="text-md text-texto flex items-center gap-3 rounded-md px-4 py-3"
            >
              <NavIcon name={item.icon} className="text-texto-fraco h-5 w-5" />
              {item.label}
            </Link>
          ))}
        </div>
      </dialog>
    </>
  );
}
