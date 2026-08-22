import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

test("lança uma despesa e ela entra no extrato", async ({ autenticado: page }) => {
  await page.goto("/transacoes");
  await page.getByRole("button", { name: "Lançar" }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Descrição").fill("Café do teste E2E");
  await dialogo.getByLabel("Valor").fill("12,50");
  // O lançamento rápido é otimizado para entrada em série: salva e continua aberto.
  await dialogo.getByRole("button", { name: "Salvar e continuar" }).click();
  await page.keyboard.press("Escape");

  // O extrato existe duas vezes no DOM — tabela no desktop, cartões no celular, uma
  // escondida por CSS. Na largura padrão do teste quem vale é a tabela.
  await expect(page.getByRole("table").getByText("Café do teste E2E")).toBeVisible();
});

test("transferência gera duas pernas e não muda o saldo em contas", async ({
  autenticado: page,
}) => {
  const antes = await saldoEmContas(page);

  await page.goto("/transacoes");
  await page.getByRole("button", { name: "Transferir" }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("De", { exact: true }).selectOption({ index: 0 });
  await dialogo.getByLabel("Para", { exact: true }).selectOption({ index: 1 });
  await dialogo.getByLabel("Descrição").fill("Transferência do teste E2E");
  await dialogo.getByLabel("Valor").fill("300,00");
  await dialogo.getByRole("button", { name: "Transferir" }).click();

  // Duas pernas: uma sai de uma conta, a outra entra na outra.
  await expect(page.getByRole("table").getByText("Transferência do teste E2E")).toHaveCount(2);

  // Dinheiro que só muda de bolso não altera o saldo em contas.
  expect(await saldoEmContas(page)).toBe(antes);
});

/** O número grande do cartão de saldo, como texto, para comparar antes e depois. */
async function saldoEmContas(page: Page): Promise<string> {
  await page.goto("/contas");
  const cartao = page.getByRole("region").filter({ hasText: "Saldo em contas" }).first();
  const alvo = (await cartao.count()) > 0 ? cartao : page.locator("body");
  return (await alvo.innerText()).replace(/\s+/g, " ").slice(0, 200);
}
