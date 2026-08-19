import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function OrcamentosPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Orçamentos"
        description="Limite por categoria no mês, comparado ao ritmo esperado até hoje."
      />
      <EmptyState
        title="Nenhum orçamento definido"
        description="Tela ainda sem dados: o shell veio primeiro."
      />
    </div>
  );
}
