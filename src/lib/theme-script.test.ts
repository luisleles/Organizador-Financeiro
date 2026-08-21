import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { THEME_SCRIPT, THEME_SCRIPT_HASH } from "./theme-script";

describe("THEME_SCRIPT_HASH", () => {
  it("corresponde ao script que a página injeta", () => {
    const calculado = createHash("sha256").update(THEME_SCRIPT, "utf8").digest("base64");

    // Se este teste quebrou, o script mudou e a CSP passaria a barrá-lo: atualize o hash
    // com o valor que aparece no erro.
    expect(THEME_SCRIPT_HASH).toBe(`sha256-${calculado}`);
  });
});
