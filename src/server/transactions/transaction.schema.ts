import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .describe("Data no calendário de São Paulo");

const description = z.string().trim().min(1, "Informe uma descrição").max(120, "Descrição longa");

/** O valor chega sempre positivo: quem decide o sinal é o tipo do lançamento. */
const positiveCents = z.number().int().positive("O valor precisa ser maior que zero");

const notes = z
  .string()
  .trim()
  .max(500, "Observação longa")
  .optional()
  .transform((value) => value || null);

export const ENTRY_TYPES = ["INCOME", "EXPENSE"] as const;

export const transactionInputSchema = z.object({
  date: isoDate,
  description,
  amountCents: positiveCents,
  type: z.enum(ENTRY_TYPES, { message: "Selecione o tipo" }),
  accountId: z.string().min(1, "Selecione uma conta"),
  categoryId: z.string().nullable(),
  tagIds: z.array(z.string().min(1)),
  notes,
  installments: z.number().int().min(1).max(60).optional(),
  installmentScope: z.enum(["SINGLE", "FUTURE"]).optional(),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;

export const transferInputSchema = z
  .object({
    date: isoDate,
    description,
    amountCents: positiveCents,
    fromAccountId: z.string().min(1, "Selecione a conta de origem"),
    toAccountId: z.string().min(1, "Selecione a conta de destino"),
    notes,
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    path: ["toAccountId"],
    message: "Escolha uma conta diferente da origem",
  });

export type TransferInput = z.infer<typeof transferInputSchema>;

export const transactionIdsSchema = z.array(z.string().min(1)).min(1, "Selecione ao menos um item");
