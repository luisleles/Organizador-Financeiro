import { Amount } from "@/components/ui/amount";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, TableCell, TableGroupRow, TableHeadCell } from "@/components/ui/table";
import { Section, Specimen } from "./section";

type Entry = {
  description: string;
  category: string;
  account: string;
  amountCents: number;
  overBudget?: boolean;
};

const ENTRIES: Entry[] = [
  { description: "Mercado Dia", category: "Alimentação", account: "Nubank", amountCents: -18790 },
  { description: "Uber", category: "Transporte", account: "Nubank", amountCents: -2450 },
  {
    description: "Ingresso show",
    category: "Lazer",
    account: "Nubank",
    amountCents: -12000,
    overBudget: true,
  },
  { description: "Salário", category: "Renda", account: "Itaú", amountCents: 240000 },
];

const DAY_TOTAL_CENTS = ENTRIES.reduce((total, entry) => total + entry.amountCents, 0);

export function DataSection() {
  return (
    <Section
      id="dados"
      title="Dados"
      note="A coluna de valores tem borda esquerda própria e atravessa cabeçalho, linhas, subtotais e skeleton sem se deslocar um pixel. Carmim marca o que furou o orçamento, não o fato de ser uma despesa."
    >
      <div className="grid gap-8 lg:grid-cols-2">
        <Card title="Extrato" action={<Badge tone="previsto">18 de 31 dias</Badge>}>
          <Table caption="Lançamentos de agosto">
            <thead>
              <tr>
                <TableHeadCell>Descrição</TableHeadCell>
                <TableHeadCell>Categoria</TableHeadCell>
                <TableHeadCell value>Valor</TableHeadCell>
              </tr>
            </thead>
            <tbody>
              <TableGroupRow
                label="seg, 18 ago"
                columnSpan={2}
                total={<Amount cents={DAY_TOTAL_CENTS} size="sm" />}
              />
              {ENTRIES.map((entry) => (
                <tr key={entry.description}>
                  <TableCell>
                    <span className="block">{entry.description}</span>
                    <span className="text-texto-fraco text-xs">{entry.account}</span>
                  </TableCell>
                  <TableCell muted>{entry.category}</TableCell>
                  <TableCell value>
                    <Amount cents={entry.amountCents} tone={entry.overBudget ? "alerta" : "auto"} />
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>

        <div className="flex flex-col gap-8">
          <Specimen label="Valor">
            <div className="flex flex-wrap items-baseline gap-6">
              <Amount cents={841290} size="hero" tone="neutro" showSign={false} showCurrency />
              <Amount cents={240000} size="lg" />
              <Amount cents={-31240} size="md" />
              <Amount cents={-35400} size="md" tone="alerta" />
              <Amount cents={129900} size="md" tone="previsto" />
            </div>
          </Specimen>

          <Specimen label="Skeleton">
            <Card>
              <SkeletonRows rows={3} />
            </Card>
          </Specimen>

          <Specimen label="Estado vazio">
            <EmptyState
              title="Nenhum lançamento em agosto"
              description="Assim que o primeiro lançamento entrar, o batimento do mês começa a se desenhar aqui."
              action={<Button variant="primary">Lançar o primeiro</Button>}
            />
          </Specimen>
        </div>
      </div>
    </Section>
  );
}
