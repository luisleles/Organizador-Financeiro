import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globalSetup: ["./vitest.global-setup.mts"],
    setupFiles: ["./vitest.setup.mts"],
    // Um banco só, compartilhado: rodar arquivos em paralelo embaralharia as fixtures.
    fileParallelism: false,
  },
});
