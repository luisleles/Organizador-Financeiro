import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/server/auth/password";
import { MIN_PASSWORD_LENGTH } from "../src/server/auth/auth.schema";

/**
 * Redefine a senha do único usuário pelo terminal. É a saída para quem esqueceu a senha:
 * quem tem acesso ao arquivo do banco já pode tudo, então não há segredo a proteger aqui —
 * o que há é uma forma de recuperar o acesso sem editar SQL na mão.
 */
async function main() {
  const user = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });

  if (!user) {
    console.error(
      "Nenhum usuário no banco. Rode `npm run db:seed` ou crie o acesso na tela de login.",
    );
    process.exitCode = 1;
    return;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  const senha = (await rl.question(`Nova senha para ${user.email}: `)).trim();
  rl.close();

  if (senha.length < MIN_PASSWORD_LENGTH) {
    console.error(`A senha precisa ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.`);
    process.exitCode = 1;
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(senha) },
  });

  console.log("Senha atualizada.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
