import { expect, test } from "./fixtures";

const EXTRATO = [
  "Data;Historico;Valor",
  "10/08/2026;Mercado do teste E2E;-125,90",
  "11/08/2026;Reembolso do teste E2E;42,00",
].join("\n");

test("importa um CSV, revisa e só grava depois de confirmar", async ({ autenticado: page }) => {
  await page.goto("/importar");

  await page.getByLabel("Extrato").setInputFiles({
    name: "extrato-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(EXTRATO, "utf8"),
  });

  await page.getByRole("button", { name: "Revisar antes de importar" }).click();

  const revisao = page.getByRole("region", { name: /Revisão/ }).or(page.locator("section"));
  await expect(page.getByText("Mercado do teste E2E")).toBeVisible();
  await expect(page.getByText("Reembolso do teste E2E")).toBeVisible();
  await expect(revisao.getByText("NOVOS").first()).toBeVisible();

  await page.getByRole("button", { name: /^Importar 2$/ }).click();
  await expect(page.getByText(/2 lançamentos importados/)).toBeVisible();

  // O que entrou aparece no extrato.
  await page.goto("/transacoes?periodo=ano");
  await expect(page.getByText("Mercado do teste E2E")).toBeVisible();
});

test("reimportar o mesmo arquivo não duplica nada", async ({ autenticado: page }) => {
  await page.goto("/importar");

  await page.getByLabel("Extrato").setInputFiles({
    name: "extrato-e2e.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(EXTRATO, "utf8"),
  });
  await page.getByRole("button", { name: "Revisar antes de importar" }).click();

  await expect(page.getByText("já importado").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Importar/ })).toBeDisabled();
});
