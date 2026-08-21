import { expect, test } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./global-setup";

test.describe("Login", () => {
  test("recusa senha errada sem revelar se o e-mail existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(E2E_EMAIL);
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.locator("form").getByRole("alert")).toHaveText("E-mail ou senha inválidos.");
    await expect(page).toHaveURL(/\/login/);
  });

  test("entra com as credenciais certas e chega ao painel", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill(E2E_EMAIL);
    await page.getByLabel("Senha").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { name: "Início" })).toBeVisible();
  });

  test("rota protegida manda para o login e volta ao destino depois de entrar", async ({
    page,
  }) => {
    await page.goto("/contas");
    await expect(page).toHaveURL(/\/login\?destino=%2Fcontas/);

    await page.getByLabel("E-mail").fill(E2E_EMAIL);
    await page.getByLabel("Senha").fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL("/contas");
  });
});
