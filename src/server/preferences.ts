import { cookies } from "next/headers";

const VALUES_HIDDEN_COOKIE = "valores-ocultos";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * A preferência vive em cookie, e não em `localStorage`, para que o servidor já renderize
 * os valores mascarados. Com estado no cliente haveria um instante com os números à
 * mostra — exatamente o que quem liga essa opção em público quer evitar.
 */
export async function readValuesHidden(): Promise<boolean> {
  const store = await cookies();
  return store.get(VALUES_HIDDEN_COOKIE)?.value === "1";
}

export async function writeValuesHidden(hidden: boolean): Promise<void> {
  const store = await cookies();
  store.set(VALUES_HIDDEN_COOKIE, hidden ? "1" : "0", {
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    path: "/",
  });
}
