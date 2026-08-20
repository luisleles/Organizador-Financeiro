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

export const goalInputSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome").max(60, "Nome muito longo"),
    targetCents: z.number().int().positive("O alvo precisa ser maior que zero"),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    color: z.enum(GOAL_COLORS, { message: "Selecione uma cor" }),
    icon: z.enum(GOAL_ICONS, { message: "Selecione um ícone" }),
    accountId: z.string().nullable(),
    useAccountBalance: z.boolean(),
  })
  .refine((value) => !value.useAccountBalance || value.accountId !== null, {
    path: ["useAccountBalance"],
    message: "Escolha uma conta para usar o saldo dela como progresso.",
  });

export type GoalInput = z.infer<typeof goalInputSchema>;

export const contributionInputSchema = z.object({
  goalId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  amountCents: z
    .number()
    .int()
    .refine((value) => value !== 0, "O aporte não pode ser zero"),
  note: z
    .string()
    .trim()
    .max(120, "Observação longa")
    .optional()
    .transform((value) => value || null),
});

export type ContributionInput = z.infer<typeof contributionInputSchema>;
