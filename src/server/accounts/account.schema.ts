import { z } from "zod";

/**
 * Zod fica na camada de domínio de propósito: a mesma regra que a Server Action usa para
 * recusar um formulário é a que o serviço usa para se proteger, e não existem duas
 * definições de "conta válida" para sair de sincronia.
 */

export const ACCOUNT_TYPES = ["CHECKING", "SAVINGS", "CREDIT_CARD", "INVESTMENT", "CASH"] as const;

export const ACCOUNT_ICONS = ["landmark", "wallet", "piggy-bank", "credit-card", "chart"] as const;

/** Paleta fechada: a cor da conta é um marcador de identificação, não um acento livre. */
export const ACCOUNT_COLORS = [
  "#0B6E75",
  "#2653D9",
  "#7A5AF8",
  "#A85B12",
  "#B0234A",
  "#4B6357",
  "#8A6D3B",
  "#3B474C",
] as const;

const dayOfMonth = z.number().int("Dia inválido").min(1, "Dia inválido").max(31, "Dia inválido");

const baseAccount = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(60, "Nome muito longo"),
  institution: z
    .string()
    .trim()
    .max(60, "Nome da instituição muito longo")
    .optional()
    .transform((value) => value || null),
  type: z.enum(ACCOUNT_TYPES, { message: "Selecione um tipo" }),
  initialBalanceCents: z.number().int(),
  color: z.enum(ACCOUNT_COLORS, { message: "Selecione uma cor" }),
  icon: z.enum(ACCOUNT_ICONS, { message: "Selecione um ícone" }),
  closingDay: dayOfMonth.nullable(),
  dueDay: dayOfMonth.nullable(),
  creditLimitCents: z.number().int().min(0).nullable(),
  lastFourDigits: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Informe os 4 últimos dígitos")
    .nullable(),
  brand: z.string().trim().max(40, "Bandeira muito longa").nullable(),
});

/**
 * O schema do Prisma não expressa "obrigatório apenas quando `type = CREDIT_CARD`", então
 * a regra vive aqui — e o inverso também vale: campos de fatura em conta que não é cartão
 * são descartados em vez de gravados como lixo.
 */
export const accountInputSchema = baseAccount.superRefine((value, ctx) => {
  if (value.type !== "CREDIT_CARD") return;

  const requiredFields = ["closingDay", "dueDay", "creditLimitCents"] as const;
  for (const field of requiredFields) {
    if (value[field] === null) {
      ctx.addIssue({
        code: "custom",
        path: [field],
        message: "Obrigatório para cartão de crédito",
      });
    }
  }
});

export type AccountInput = z.infer<typeof accountInputSchema>;

export const accountIdSchema = z.string().min(1, "Conta inválida");
