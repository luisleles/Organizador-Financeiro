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
  /**
   * `always` para linha de extrato (+/−), `negative` para saldo (só o menos, porque um
   * saldo negativo sem sinal mente), `never` para grandeza sem direção, como um limite.
   */
  sign?: "always" | "negative" | "never";
  showCurrency?: boolean;
  /** Esconde os dígitos preservando a largura da coluna e o tom do valor. */
  masked?: boolean;
  className?: string;
};

export function Amount({
  cents,
  tone = "auto",
  size = "sm",
  sign = "always",
  showCurrency = false,
  masked = false,
  className,
}: AmountProps) {
  const parts = formatBRLParts(cents);
  const resolvedTone =
    tone === "auto" ? (cents < 0 ? "saida" : cents > 0 ? "entrada" : "neutro") : tone;
  const signGlyph = sign === "never" || (sign === "negative" && cents >= 0) ? "" : parts.sign;

  if (masked) {
    return (
      <span
        aria-label="Valor oculto"
        className={cn(
          "valor whitespace-nowrap",
          SIZE_CLASS[size],
          TONE_CLASS[resolvedTone],
          className,
        )}
      >
        ••••
      </span>
    );
  }

  return (
    <span
      className={cn(
        "valor whitespace-nowrap",
        SIZE_CLASS[size],
        TONE_CLASS[resolvedTone],
        className,
      )}
    >
      {showCurrency && <span className="text-texto-fraco mr-1 text-[0.55em]">R$</span>}
      {signGlyph}
      {parts.whole}
      <span className="text-[0.85em] opacity-70">,{parts.fraction}</span>
    </span>
  );
}
