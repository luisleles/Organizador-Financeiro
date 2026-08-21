import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "bg-tinta text-tinta-avesso hover:opacity-90",
  secondary: "bg-superficie text-texto border border-linha hover:border-linha-forte",
  ghost: "text-texto-fraco hover:bg-superficie hover:text-texto",
  danger: "bg-alerta-fill text-tinta-avesso hover:opacity-90",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  // No celular todo botão tem ao menos 44px de altura; no desktop, onde o ponteiro é
  // preciso, a densidade original volta.
  sm: "min-h-11 sm:min-h-0 h-11 sm:h-8 gap-1.5 px-3 text-xs",
  md: "min-h-11 h-11 sm:h-10 gap-2 px-4 text-sm",
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
};

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-45",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
