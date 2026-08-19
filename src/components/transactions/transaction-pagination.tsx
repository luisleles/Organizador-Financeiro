import Link from "next/link";
import { cn } from "@/lib/cn";
import { FILTER_PARAMS, PAGE_SIZE } from "@/server/transactions/transaction.filters";

type TransactionPaginationProps = {
  page: number;
  pageCount: number;
  totalCount: number;
  /** Query atual sem o parâmetro de página. */
  baseParams: URLSearchParams;
};

export function TransactionPagination({
  page,
  pageCount,
  totalCount,
  baseParams,
}: TransactionPaginationProps) {
  if (totalCount === 0) return null;

  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, totalCount);

  return (
    <nav
      aria-label="Paginação"
      className="border-linha flex flex-wrap items-center justify-between gap-3 border-t pt-3"
    >
      <p className="text-texto-fraco text-xs">
        <span className="valor text-texto">
          {first}–{last}
        </span>{" "}
        de <span className="valor text-texto">{totalCount}</span>
      </p>

      <div className="flex items-center gap-2">
        <PageLink page={page - 1} disabled={page <= 1} baseParams={baseParams}>
          Anterior
        </PageLink>
        <span className="valor text-num-xs text-texto-fraco">
          {page} / {pageCount}
        </span>
        <PageLink page={page + 1} disabled={page >= pageCount} baseParams={baseParams}>
          Próxima
        </PageLink>
      </div>
    </nav>
  );
}

type PageLinkProps = {
  page: number;
  disabled: boolean;
  baseParams: URLSearchParams;
  children: string;
};

function PageLink({ page, disabled, baseParams, children }: PageLinkProps) {
  const className = cn(
    "rounded-md border px-3 py-1.5 text-xs transition",
    disabled
      ? "border-linha text-texto-fraco pointer-events-none opacity-45"
      : "border-linha text-texto hover:border-linha-forte",
  );

  if (disabled) {
    return (
      <span aria-disabled className={className}>
        {children}
      </span>
    );
  }

  const params = new URLSearchParams(baseParams);
  if (page > 1) params.set(FILTER_PARAMS.page, String(page));
  else params.delete(FILTER_PARAMS.page);

  return (
    <Link href={`/transacoes?${params}`} className={className}>
      {children}
    </Link>
  );
}
