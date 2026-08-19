import { cn } from "@/lib/cn";
import { formatBRLParts } from "@/lib/money";

type AmountTone = "auto" | "entrada" | "saida" | "alerta" | "previsto" | "neutro";
type AmountSize = "xs" | "sm" | "md" | "lg" | "hero";

const TONE_CLASS: Record<Exclude<AmountTone, "auto">, string> = {
  entrada: "text-entrada",
  saida: "text-saida",
  alerta: "text-alerta",
  previsto: "text-previsto",
  neutro: "text-texto",
};

const SIZE_CLASS: Record<AmountSize, string> = {
  xs: "text-num-xs",
  sm: "text-num-sm",
  md: "text-num-md",
  lg: "text-num-lg",
  hero: "text-num-hero",
};

type AmountProps = {
  cents: number;
  tone?: AmountTone;
  size?: AmountSize;
  showSign?: boolean;
  showCurrency?: boolean;
  className?: string;
};

export function Amount({
  cents,
  tone = "auto",
  size = "sm",
  showSign = true,
  showCurrency = false,
  className,
}: AmountProps) {
  const { sign, whole, fraction } = formatBRLParts(cents);
  const resolvedTone =
    tone === "auto" ? (cents < 0 ? "saida" : cents > 0 ? "entrada" : "neutro") : tone;

  return (
    <span
      className={cn(
        "valor whitespace-nowrap",
        SIZE_CLASS[size],
        TONE_CLASS[resolvedTone],
        className,
      )}
    >
      {showCurrency && <span className="text-texto-fraco mr-1">R$</span>}
      {showSign && sign}
      {whole}
      <span className="text-[0.85em] opacity-70">,{fraction}</span>
    </span>
  );
}
