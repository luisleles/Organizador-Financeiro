import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeTone = "entrada" | "saida" | "alerta" | "previsto" | "neutro";

const TONE_CLASS: Record<BadgeTone, string> = {
  entrada: "bg-entrada-suave text-entrada",
  saida: "bg-saida-suave text-saida",
  alerta: "bg-alerta-suave text-alerta",
  previsto: "border border-dashed border-previsto text-previsto",
  neutro: "border border-linha text-texto-fraco",
};

type BadgeProps = {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutro", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "text-2xs inline-flex items-center rounded-sm px-1.5 py-0.5 font-semibold uppercase",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
