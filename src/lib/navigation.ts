export type NavIconName =
  | "inicio"
  | "transacoes"
  | "contas"
  | "orcamentos"
  | "metas"
  | "categorias"
  | "relatorios"
  | "configuracoes";

export type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

export type NavGroup = {
  title: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Dia a dia",
    items: [
      { href: "/", label: "Início", icon: "inicio" },
      { href: "/transacoes", label: "Transações", icon: "transacoes" },
      { href: "/contas", label: "Contas", icon: "contas" },
    ],
  },
  {
    title: "Planejamento",
    items: [
      { href: "/orcamentos", label: "Orçamentos", icon: "orcamentos" },
      { href: "/metas", label: "Metas", icon: "metas" },
    ],
  },
  {
    title: "Estrutura",
    items: [
      { href: "/categorias", label: "Categorias", icon: "categorias" },
      { href: "/relatorios", label: "Relatórios", icon: "relatorios" },
      { href: "/configuracoes", label: "Configurações", icon: "configuracoes" },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Os quatro destinos da barra inferior; o resto vive atrás de "Mais". */
export const PRIMARY_NAV_HREFS = ["/", "/transacoes", "/orcamentos", "/metas"];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
