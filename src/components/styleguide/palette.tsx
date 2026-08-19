import { Section, Specimen } from "./section";

type Swatch = {
  token: string;
  role: string;
  onDark?: boolean;
};

const SURFACES: Swatch[] = [
  { token: "bg-fundo", role: "fundo da aplicação" },
  { token: "bg-superficie", role: "card, tabela, input" },
  { token: "bg-superficie-alta", role: "modal, toast, popover" },
  { token: "bg-linha", role: "hairline" },
  { token: "bg-linha-forte", role: "hairline em destaque" },
  { token: "bg-tinta", role: "botão primário", onDark: true },
];

const SEMANTIC: Swatch[] = [
  { token: "bg-entrada-fill", role: "entrada — turquesa", onDark: true },
  { token: "bg-saida-fill", role: "saída dentro do previsto — ocre", onDark: true },
  { token: "bg-alerta-fill", role: "fora do plano — carmim", onDark: true },
  { token: "bg-previsto-fill", role: "ainda não aconteceu — bruma" },
  { token: "bg-foco", role: "foco, seleção, link", onDark: true },
];

export function PaletteSection() {
  return (
    <Section
      id="paleta"
      title="Paleta"
      note="Cor é reservada para significado financeiro. Turquesa e ocre substituem verde e vermelho porque sobrevivem a protanopia e deuteranopia, e porque carmim precisa ficar livre para sinalizar o que realmente saiu do plano."
    >
      <div className="grid gap-8 sm:grid-cols-2">
        <Specimen label="Neutros">
          <SwatchList swatches={SURFACES} />
        </Specimen>
        <Specimen label="Semânticas">
          <SwatchList swatches={SEMANTIC} />
        </Specimen>
      </div>
    </Section>
  );
}

function SwatchList({ swatches }: { swatches: Swatch[] }) {
  return (
    <ul className="border-linha overflow-hidden rounded-lg border">
      {swatches.map((swatch) => (
        <li key={swatch.token} className="border-linha flex items-stretch border-b last:border-b-0">
          <span
            aria-hidden
            className={`${swatch.token} text-2xs flex w-28 shrink-0 items-center justify-center font-semibold ${
              swatch.onDark ? "text-tinta-avesso" : "text-texto"
            }`}
          >
            Aa
          </span>
          <span className="bg-superficie flex flex-1 flex-col justify-center px-4 py-2.5">
            <code className="valor text-num-xs text-texto">{swatch.token}</code>
            <span className="text-texto-fraco text-xs">{swatch.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
