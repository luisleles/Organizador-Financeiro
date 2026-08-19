import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type TableProps = {
  caption?: string;
  children: ReactNode;
  className?: string;
};

export function Table({ caption, children, className }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

type TableHeadCellProps = ThHTMLAttributes<HTMLTableCellElement> & {
  /** Última coluna à direita: recebe o filete que atravessa a página inteira. */
  value?: boolean;
};

export function TableHeadCell({ value, className, children, ...props }: TableHeadCellProps) {
  return (
    <th
      scope="col"
      className={cn(
        "border-linha text-2xs text-texto-fraco border-b px-4 py-2 text-left font-semibold uppercase",
        value && "border-l text-right",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  );
}

type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  value?: boolean;
  muted?: boolean;
};

export function TableCell({ value, muted, className, children, ...props }: TableCellProps) {
  return (
    <td
      className={cn(
        "border-linha border-b px-4 py-2.5 align-middle",
        value && "border-l text-right",
        muted && "text-texto-fraco text-xs",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  );
}

type TableGroupRowProps = {
  label: string;
  total: ReactNode;
  columnSpan: number;
};

/** Cabeçalho de dia no extrato: o total do dia cai na mesma coluna dos valores. */
export function TableGroupRow({ label, total, columnSpan }: TableGroupRowProps) {
  return (
    <tr>
      <th
        scope="rowgroup"
        colSpan={columnSpan}
        className="border-linha bg-fundo text-2xs text-texto-fraco border-b px-4 py-2 text-left font-semibold uppercase"
      >
        {label}
      </th>
      <td className="border-linha bg-fundo border-b border-l px-4 py-2 text-right">{total}</td>
    </tr>
  );
}
