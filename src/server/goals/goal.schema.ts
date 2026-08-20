import { z } from "zod";

export const GOAL_COLORS = [
  "#0B6E75",
  "#2653D9",
  "#7A5AF8",
  "#A85B12",
  "#B0234A",
  "#4B6357",
  "#8A6D3B",
  "#3B474C",
] as const;

export const GOAL_ICONS = ["piggy-bank", "plane", "home", "heart", "chart", "wallet"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

export const goalInputSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(60, "Nome muito longo"),
  targetCents: z.number().int().positive("O alvo precisa ser maior que zero"),
  targetDate: isoDate,
  color: z.enum(GOAL_COLORS, { message: "Selecione uma cor" }),
  icon: z.enum(GOAL_ICONS, { message: "Selecione um ícone" }),
  /**
   * Rendimento anual esperado, só para projeção. Nunca vira transação: quem credita
   * rendimento de verdade é `registerYield`.
   */
  expectedYearlyRatePercent: z
    .number()
    .min(0, "A taxa não pode ser negativa")
    .max(100, "Taxa fora do razoável")
    .nullable(),
});

export type GoalInput = z.infer<typeof goalInputSchema>;

/** Criar a meta já com a caixinha: escolhe a conta mãe de onde o dinheiro vai sair. */
export const createBucketSchema = z.object({
  goalId: z.string().min(1),
  parentAccountId: z.string().min(1, "Escolha a conta mãe da caixinha"),
});

export const goalMovementSchema = z.object({
  goalId: z.string().min(1),
  amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
  date: isoDate,
});

export type GoalMovement = z.infer<typeof goalMovementSchema>;

/** Rendimento em lote: um valor por mês, todos positivos. */
export const yieldBatchSchema = z.object({
  goalId: z.string().min(1),
  entries: z
    .array(
      z.object({
        month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido"),
        amountCents: z.number().int().positive("O rendimento precisa ser maior que zero"),
      }),
    )
    .min(1, "Informe ao menos um mês"),
});

export type YieldBatch = z.infer<typeof yieldBatchSchema>;
