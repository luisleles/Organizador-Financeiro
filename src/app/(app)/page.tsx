import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function InicioPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Início"
        description="O Batimento do mês e o resumo do período escolhido aparecem aqui."
      />
      <EmptyState
        title="Nenhum dado ainda"
        description="O shell está de pé; os lançamentos entram na próxima fase."
      />
    </div>
  );
}
