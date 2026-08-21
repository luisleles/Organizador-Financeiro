import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/**
 * Instalado na tela inicial, o app abre sem barra de navegador. `theme_color` acompanha o
 * fundo escuro porque é a cor da barra de status enquanto o app carrega — clarear ali
 * causaria um flash branco antes da primeira pintura.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Controle Financeiro",
    short_name: "Finanças",
    description: "Controle financeiro pessoal, rodando na sua máquina.",
    lang: "pt-BR",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0e1518",
    theme_color: "#0e1518",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icones/icone-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icone-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icones/icone-mascara-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
