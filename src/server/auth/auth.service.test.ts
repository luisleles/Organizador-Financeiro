import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { changePassword, createFirstUser, eraseAllData, hasAnyUser } from "./auth.service";
import { hashPassword, verifyPassword } from "./password";

const SENHA = "senha-inicial-123";

let userId: string;

async function senhaAtual(): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { passwordHash: true },
  });
  return user.passwordHash;
}

beforeEach(async () => {
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  const user = await prisma.user.create({
    data: {
      name: "Teste",
      email: "auth@example.com",
      passwordHash: await hashPassword(SENHA),
    },
  });
  userId = user.id;
});

describe("hashPassword e verifyPassword", () => {
  it("não guarda a senha em texto puro", async () => {
    const hash = await hashPassword(SENHA);
    expect(hash).not.toContain(SENHA);
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("gera hashes diferentes para a mesma senha", async () => {
    expect(await hashPassword(SENHA)).not.toBe(await hashPassword(SENHA));
  });

  it("confere a senha certa e recusa a errada", async () => {
    const hash = await hashPassword(SENHA);
    expect(await verifyPassword(SENHA, hash)).toBe(true);
    expect(await verifyPassword("outra-coisa", hash)).toBe(false);
  });

  it("recusa quando não há hash, sem explodir", async () => {
    expect(await verifyPassword(SENHA, null)).toBe(false);
    expect(await verifyPassword(SENHA, undefined)).toBe(false);
  });
});

describe("createFirstUser", () => {
  it("recusa criar uma segunda conta", async () => {
    await expect(
      createFirstUser({ name: "Intruso", email: "outro@example.com", password: "outra-senha" }),
    ).rejects.toMatchObject({ code: "USER_EXISTS" });
  });

  it("cria a conta quando o banco está vazio, com a senha em hash", async () => {
    await prisma.user.deleteMany();
    expect(await hasAnyUser()).toBe(false);

    const id = await createFirstUser({
      name: "Dono",
      email: "  DONO@Example.com ",
      password: "senha-do-dono",
    });

    const criado = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(criado.email).toBe("dono@example.com");
    expect(await verifyPassword("senha-do-dono", criado.passwordHash)).toBe(true);
  });
});

describe("changePassword", () => {
  it("troca a senha quando a atual confere", async () => {
    const antes = await senhaAtual();

    await changePassword({
      currentPassword: SENHA,
      newPassword: "senha-nova-456",
      confirmPassword: "senha-nova-456",
    });

    const depois = await senhaAtual();
    expect(depois).not.toBe(antes);
    expect(await verifyPassword("senha-nova-456", depois)).toBe(true);
  });

  it("recusa quando a senha atual está errada", async () => {
    const antes = await senhaAtual();

    await expect(
      changePassword({
        currentPassword: "chute",
        newPassword: "senha-nova-456",
        confirmPassword: "senha-nova-456",
      }),
    ).rejects.toMatchObject({ code: "WRONG_PASSWORD" });

    expect(await senhaAtual()).toBe(antes);
  });
});

describe("eraseAllData", () => {
  beforeEach(async () => {
    const conta = await prisma.account.create({
      data: {
        userId,
        name: "Corrente",
        type: "CHECKING",
        class: "ASSET",
        initialBalanceCents: 1000,
        color: "#2653D9",
        icon: "landmark",
      },
    });

    await prisma.transaction.create({
      data: {
        userId,
        accountId: conta.id,
        date: new Date("2026-08-20T12:00:00.000Z"),
        description: "Compra",
        amountCents: -500,
        type: "EXPENSE",
      },
    });
  });

  it("recusa sem a senha certa, e nada é apagado", async () => {
    await expect(eraseAllData("chute")).rejects.toMatchObject({ code: "WRONG_PASSWORD" });
    expect(await prisma.transaction.count()).toBe(1);
    expect(await prisma.account.count()).toBe(1);
  });

  it("apaga os dados financeiros e devolve o que sumiu", async () => {
    const resumo = await eraseAllData(SENHA);

    expect(resumo).toMatchObject({ transactions: 1, accounts: 1 });
    expect(await prisma.transaction.count()).toBe(0);
    expect(await prisma.account.count()).toBe(0);
  });

  it("preserva a conta de acesso", async () => {
    await eraseAllData(SENHA);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user).not.toBeNull();
    expect(await verifyPassword(SENHA, user!.passwordHash)).toBe(true);
  });

  it("apaga caixinha antes da conta mãe, sem esbarrar na chave estrangeira", async () => {
    const mae = await prisma.account.findFirstOrThrow({ where: { userId } });
    await prisma.account.create({
      data: {
        userId,
        name: "Viagem",
        type: "SAVINGS_BUCKET",
        class: "ASSET",
        initialBalanceCents: 0,
        color: "#0B6E75",
        icon: "piggy-bank",
        parentAccountId: mae.id,
      },
    });

    await eraseAllData(SENHA);
    expect(await prisma.account.count()).toBe(0);
  });
});
