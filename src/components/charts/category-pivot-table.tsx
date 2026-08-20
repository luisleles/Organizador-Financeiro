import { Amount } from "@/components/ui/amount";
import { formatBRL } from "@/lib/money";
import { formatMonthLabel } from "@/server/categories/category.stats";
import { heatStep, type CategoryPivot } from "@/server/reports/report.aggregations";
import { HEAT_STEPS } from "./chart-theme";

type CategoryPivotTableProps = {
  pivot: CategoryPivot;
};

/**
 * Tabela pivô com heatmap. A cor é sequencial — um matiz só, do claro ao escuro — porque
 * o que ela codifica é magnitude, não identidade. O número fica na célula junto com a
 * cor: heatmap sem número obriga a adivinhar, e a cor sozinha não é acessível.
 */
export function CategoryPivotTable({ pivot }: CategoryPivotTableProps) {
  if (pivot.rows.length === 0) {
    return (
      <p className="text-texto-fraco text-sm">Nenhuma despesa categorizada nos meses analisados.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">
          Gasto por categoria em cada mês, com a intensidade da cor indicando o tamanho do gasto
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className="border-linha text-2xs text-texto-fraco sticky left-0 border-b px-3 py-2 text-left font-semibold uppercase"
            >
              Categoria
            </th>
            {pivot.months.map((month) => (
              <th
                key={month}
                scope="col"
                className="border-linha text-2xs text-texto-fraco border-b px-2 py-2 text-right font-semibold uppercase"
              >
                {formatMonthLabel(month)}
              </th>
            ))}
            <th
              scope="col"
              className="border-linha text-2xs text-texto-fraco border-b border-l px-3 py-2 text-right font-semibold uppercase"
            >
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {pivot.rows.map((row) => (
            <tr key={row.categoryId ?? row.name}>
              <th
                scope="row"
                className="border-linha text-texto border-b px-3 py-1.5 text-left font-medium whitespace-nowrap"
              >
                {row.name}
              </th>
              {row.monthlyCents.map((cents, index) => {
                const step = heatStep(cents, pivot.peakCents);

                return (
                  <td
                    key={pivot.months[index]}
                    className="border-linha valor text-num-xs border-b px-2 py-1.5 text-right"
                    style={{
                      backgroundColor: HEAT_STEPS[step],
                      color: step >= 4 ? "var(--color-tinta-avesso)" : undefined,
                    }}
                    title={`${row.name} em ${formatMonthLabel(pivot.months[index])}: ${formatBRL(cents)}`}
                  >
                    {cents === 0 ? "—" : Math.round(cents / 100).toLocaleString("pt-BR")}
                  </td>
                );
              })}
              <td className="border-linha border-b border-l px-3 py-1.5 text-right">
                <Amount cents={row.totalCents} size="xs" tone="saida" sign="never" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-texto-fraco mt-2 text-xs">
        Valores em reais, sem centavos, para caber na tabela. Passe o cursor numa célula para ver o
        valor exato. Transferências não entram.
      </p>
    </div>
  );
}
