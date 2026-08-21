import type { Metadata } from "next";
import type { ReactNode } from "react";
import { displayFont, numberFont, textFont } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle Financeiro",
  description: "Controle financeiro pessoal, uso local.",
};

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
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
