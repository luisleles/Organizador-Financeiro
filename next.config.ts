import { dirname } from "path";
import { fileURLToPath } from "url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  /** Imagem de produção enxuta: o `standalone` leva só o que o servidor precisa rodar. */
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
