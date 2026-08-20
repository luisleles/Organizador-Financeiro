import { z } from "zod";

export const budgetMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês inválido");

export const budgetInputSchema = z.object({
  categoryId: z.string().min(1, "Selecione uma categoria"),
  month: budgetMonthSchema,
  limitCents: z.number().int().min(0, "O limite não pode ser negativo"),
});

export type BudgetInput = z.infer<typeof budgetInputSchema>;
