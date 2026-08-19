import type { ReactNode } from "react";

type SectionProps = {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
};

export function Section({ id, title, note, children }: SectionProps) {
  return (
    <section id={id} className="border-linha flex scroll-mt-20 flex-col gap-4 border-t pt-8">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl">{title}</h2>
        {note && <p className="text-md text-texto-fraco max-w-2xl">{note}</p>}
      </header>
      {children}
    </section>
  );
}

type SpecimenProps = {
  label: string;
  children: ReactNode;
};

export function Specimen({ label, children }: SpecimenProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-2xs text-texto-fraco font-semibold uppercase">{label}</p>
      {children}
    </div>
  );
}
