import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .describe("Data no calendário de São Paulo");

export const RECURRING_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

export const recurringRuleInputSchema = z
  .object({
    description: z.string().trim().min(1, "Informe uma descrição").max(120, "Descrição longa"),
    amountCents: z.number().int().positive("O valor precisa ser maior que zero"),
    type: z.enum(["INCOME", "EXPENSE"], { message: "Selecione o tipo" }),
    accountId: z.string().min(1, "Selecione uma conta"),
    categoryId: z.string().nullable(),
    frequency: z.enum(RECURRING_FREQUENCIES, { message: "Selecione a frequência" }),
    interval: z.number().int().min(1, "O intervalo mínimo é 1").max(60, "Intervalo alto demais"),
    dayOfMonth: z.number().int().min(1).max(31).nullable(),
    startDate: isoDate,
    endDate: isoDate.nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "O término não pode ser antes do início",
      });
    }
    if (value.dayOfMonth !== null && value.frequency !== "MONTHLY") {
      ctx.addIssue({
        code: "custom",
        path: ["dayOfMonth"],
        message: "O dia fixo do mês só vale para regras mensais",
      });
    }
  });

export type RecurringRuleInput = z.infer<typeof recurringRuleInputSchema>;

export const occurrenceRefSchema = z.object({
  ruleId: z.string().min(1),
  date: isoDate,
});

export type OccurrenceRef = z.infer<typeof occurrenceRefSchema>;
