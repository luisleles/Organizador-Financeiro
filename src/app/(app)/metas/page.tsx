import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function MetasPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Metas" description="Objetivos de reserva com aportes e data-alvo." />
      <EmptyState
        title="Nenhuma meta definida"
        description="Tela ainda sem dados: o shell veio primeiro."
      />
    </div>
  );
}
