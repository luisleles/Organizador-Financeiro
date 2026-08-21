import { expect, test } from "./fixtures";

test("cria uma conta e ela aparece na lista com o saldo inicial", async ({ autenticado: page }) => {
  await page.goto("/contas");
  await page.getByRole("button", { name: "Nova conta" }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Nome").fill("Conta do teste E2E");
  await dialogo.getByLabel("Saldo inicial").fill("1.250,00");
  await dialogo.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("link", { name: "Conta do teste E2E" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Conta do teste E2E/ })).toContainText("1.250");
});
