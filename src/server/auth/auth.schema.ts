import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 8;

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

const strongPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres`)
  .max(200, "Senha longa demais");

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Informe a senha atual"),
    newPassword: strongPassword,
    confirmPassword: z.string().min(1, "Repita a nova senha"),
  })
  .superRefine((value, ctx) => {
    if (value.newPassword !== value.confirmPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "As senhas não coincidem",
      });
    }
    if (value.newPassword === value.currentPassword) {
      ctx.addIssue({
        code: "custom",
        path: ["newPassword"],
        message: "A nova senha precisa ser diferente da atual",
      });
    }
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Apagar tudo exige digitar a frase: um clique acidental não pode ser suficiente. */
export const ERASE_CONFIRMATION = "APAGAR TUDO";

export const eraseSchema = z.object({
  password: z.string().min(1, "Informe a senha"),
  confirmation: z.literal(ERASE_CONFIRMATION, {
    message: `Digite exatamente ${ERASE_CONFIRMATION}`,
  }),
});
