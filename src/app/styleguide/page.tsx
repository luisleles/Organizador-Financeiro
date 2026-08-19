import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { ControlsSection } from "@/components/styleguide/controls";
import { DataSection } from "@/components/styleguide/data";
import { OverlaysSection } from "@/components/styleguide/overlays";
import { PaletteSection } from "@/components/styleguide/palette";
import { TypographySection } from "@/components/styleguide/typography";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Styleguide · Controle Financeiro",
};

export default function StyleguidePage() {
  return (
    <ToastProvider>
      <main className="mx-auto flex max-w-6xl flex-col gap-10 px-4 pt-10 pb-24 sm:px-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <p className="text-2xs text-texto-fraco font-semibold uppercase">Design system</p>
            <h1 className="font-display text-3xl">Tinta, papel e três cores</h1>
          </div>
          <ThemeToggle />
        </header>

        <PaletteSection />
        <TypographySection />
        <ControlsSection />
        <DataSection />
        <OverlaysSection />
      </main>
    </ToastProvider>
  );
}
