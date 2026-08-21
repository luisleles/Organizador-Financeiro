import { z } from "zod";
import { DATE_FORMATS } from "./csv.parse";

export const SOURCE_IDS = ["csv", "ofx"] as const;

export const columnMappingSchema = z.object({
  date: z.number().int().min(0, "Escolha a coluna da data"),
  description: z.number().int().min(0, "Escolha a coluna da descrição"),
  amount: z.number().int(),
  credit: z.number().int().optional(),
  debit: z.number().int().optional(),
  externalId: z.number().int().optional(),
});

export const previewRequestSchema = z
  .object({
    sourceId: z.enum(SOURCE_IDS),
    accountId: z.string().min(1, "Selecione a conta"),
    text: z.string().min(1, "Arquivo vazio"),
    since: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    dateFormat: z.enum(DATE_FORMATS),
    headerRows: z.number().int().min(0).max(20),
    mapping: columnMappingSchema,
  })
  .superRefine((value, ctx) => {
    if (value.sourceId !== "csv") return;
    const temValorUnico = value.mapping.amount >= 0;
    const temDuasColunas = value.mapping.credit !== undefined || value.mapping.debit !== undefined;

    if (!temValorUnico && !temDuasColunas) {
      ctx.addIssue({
        code: "custom",
        path: ["mapping", "amount"],
        message: "Escolha a coluna de valor, ou as colunas de entrada e saída",
      });
    }
  });

export type PreviewRequest = z.infer<typeof previewRequestSchema>;

export const confirmRowSchema = z.object({
  externalId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(120),
  amountCents: z.number().int(),
  categoryId: z.string().nullable(),
});

export const confirmImportSchema = z.object({
  sourceId: z.enum(SOURCE_IDS),
  accountId: z.string().min(1),
  rows: z.array(confirmRowSchema).min(1, "Selecione ao menos um lançamento"),
});

export type ConfirmImportInput = z.infer<typeof confirmImportSchema>;
export type ConfirmRow = z.infer<typeof confirmRowSchema>;
