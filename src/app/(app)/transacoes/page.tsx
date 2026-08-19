import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function TransacoesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transações"
        description="Extrato do período, agrupado por dia, com a coluna de valores fixa à direita."
      />
      <EmptyState
        title="Nenhum lançamento no período"
        description="Tela ainda sem dados: o shell veio primeiro."
      />
    </div>
  );
}
