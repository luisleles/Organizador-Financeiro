import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import prettierConfig from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  prettierConfig,
  {
    rules: {
      // Server Action recebe (state, formData) por contrato do `useActionState`, mesmo
      // quando não usa os dois. O underscore marca o parâmetro como deliberadamente ocioso.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // O `use` das fixtures do Playwright não é o hook do React, e a regra de hooks só
    // enxerga o nome. Desligar a regra na pasta é mais honesto do que renomear a fixture.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "playwright-report/**"]),
]);

export default eslintConfig;
