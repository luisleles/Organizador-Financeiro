import { Archivo, Bricolage_Grotesque, Geist_Mono } from "next/font/google";

/** Só rótulo de período, título de página e headline de estado vazio. Nunca toca um número. */
export const displayFont = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  variable: "--font-bricolage",
  display: "swap",
});

export const textFont = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

/** Todo valor monetário, data em tabela, percentual e contador. */
export const numberFont = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});
