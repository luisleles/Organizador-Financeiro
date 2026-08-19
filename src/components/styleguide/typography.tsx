import { Section, Specimen } from "./section";

const TEXT_SCALE = [
  { className: "text-3xl font-display", token: "text-3xl · display" },
  { className: "text-2xl font-display", token: "text-2xl · display" },
  { className: "text-xl font-display", token: "text-xl · display" },
  { className: "text-lg", token: "text-lg · texto" },
  { className: "text-md", token: "text-md · texto" },
  { className: "text-sm", token: "text-sm · texto (base de tabela)" },
  { className: "text-xs text-texto-fraco", token: "text-xs · metadado" },
  { className: "text-2xs font-semibold uppercase text-texto-fraco", token: "text-2xs · rótulo" },
];

const NUMBER_SCALE = [
  { className: "text-num-hero", token: "text-num-hero", sample: "8.412,90" },
  { className: "text-num-lg", token: "text-num-lg", sample: "1.940,55" },
  { className: "text-num-md", token: "text-num-md", sample: "−312,40" },
  { className: "text-num-sm", token: "text-num-sm", sample: "+2.400,00" },
  { className: "text-num-xs", token: "text-num-xs", sample: "18/08/2026" },
];

export function TypographySection() {
  return (
    <Section
      id="tipografia"
      title="Tipografia"
      note="Bricolage Grotesque só em título e estado vazio; Archivo em toda a interface; Geist Mono em todo número, sem exceção — inclusive no saldo. Dígitos tabulares com zero cortado mantêm a vírgula alinhada em coluna."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <Specimen label="Escala de texto">
          <ul className="flex flex-col gap-3">
            {TEXT_SCALE.map((item) => (
              <li key={item.token} className="flex flex-col gap-0.5">
                <span className={item.className}>Orçamento de agosto</span>
                <code className="valor text-num-xs text-texto-fraco">{item.token}</code>
              </li>
            ))}
          </ul>
        </Specimen>
        <Specimen label="Escala numérica">
          <ul className="flex flex-col gap-3">
            {NUMBER_SCALE.map((item) => (
              <li key={item.token} className="flex flex-col gap-0.5">
                <span className={`valor ${item.className}`}>{item.sample}</span>
                <code className="valor text-num-xs text-texto-fraco">{item.token}</code>
              </li>
            ))}
          </ul>
        </Specimen>
      </div>
    </Section>
  );
}
