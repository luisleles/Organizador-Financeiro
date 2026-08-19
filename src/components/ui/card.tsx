import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type CardProps = {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Card({ title, action, children, className }: CardProps) {
  return (
    <section className={cn("border-linha bg-superficie rounded-lg border", className)}>
      {(title || action) && (
        <header className="border-linha flex items-center justify-between gap-4 border-b px-4 py-3">
          {title && <h2 className="text-2xs text-texto-fraco font-semibold uppercase">{title}</h2>}
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
