import type { Metadata } from "next";
import type { ReactNode } from "react";
import { displayFont, numberFont, textFont } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle Financeiro",
  description: "Controle financeiro pessoal, uso local.",
};

/** Aplica o tema salvo antes da primeira pintura para não piscar claro/escuro. */
const themeScript = `try{const t=localStorage.getItem("tema");if(t)document.documentElement.dataset.theme=t}catch{}`;

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={cn(displayFont.variable, textFont.variable, numberFont.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
