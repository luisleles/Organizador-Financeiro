import Link from "next/link";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/navigation";
import { NavIcon } from "./nav-icon";

type NavLinkProps = {
  item: NavItem;
  query: string;
  variant: "rail" | "bar";
  active: boolean;
};

/**
 * Puramente apresentacional — sem `usePathname`. O estado ativo chega por prop para que
 * este componente possa ser renderizado tanto no servidor quanto dentro de um componente
 * de cliente. Ver `app-shell.tsx` para o porquê.
 */
export function NavLink({ item, query, variant, active }: NavLinkProps) {
  if (variant === "bar") {
    return (
      <Link
        href={`${item.href}${query}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-2xs flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-1 py-2 font-semibold transition",
          active ? "text-texto" : "text-texto-fraco",
        )}
      >
        <NavIcon name={item.icon} className="h-5 w-5" />
        <span className="w-full truncate text-center">{item.shortLabel}</span>
      </Link>
    );
  }

  return (
    <Link
      href={`${item.href}${query}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 border-l-2 py-2 pr-2 pl-3 text-sm transition",
        active
          ? "border-tinta bg-superficie text-texto font-medium"
          : "text-texto-fraco hover:bg-superficie hover:text-texto border-transparent",
      )}
    >
      <NavIcon name={item.icon} className="h-4.5 w-4.5 shrink-0" />
      {item.label}
    </Link>
  );
}
