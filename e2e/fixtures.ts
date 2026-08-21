import { expect, test as base, type Page } from "@playwright/test";
import { E2E_EMAIL, E2E_PASSWORD } from "./global-setup";

export { expect };

/** Faz login uma vez por teste: a sessão é um cookie, e cada teste começa com o seu. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E_EMAIL);
  await page.getByLabel("Senha").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL("/");
}

export const test = base.extend<{ autenticado: Page }>({
  autenticado: async ({ page }, use) => {
    await login(page);
    await use(page);
  },
});
