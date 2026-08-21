import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { displayFont, numberFont, textFont } from "@/lib/fonts";
import { cn } from "@/lib/cn";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker";
import { THEME_SCRIPT } from "@/lib/theme-script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Controle Financeiro",
  description: "Controle financeiro pessoal, uso local.",
  appleWebApp: { capable: true, title: "Finanças", statusBarStyle: "black-translucent" },
};

/**
 * `viewport-fit=cover` é o que libera as `safe-area-inset`: sem ele, o iPhone reserva a
 * faixa do indicador de home e a barra inferior do app fica flutuando acima dela.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f5f6" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1518" },
  ],
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
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
