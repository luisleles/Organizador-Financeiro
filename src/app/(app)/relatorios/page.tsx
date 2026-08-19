import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function RelatoriosPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Relatórios" description="Comparações por categoria, conta e período." />
      <EmptyState
        title="Nada para relatar ainda"
        description="Tela ainda sem dados: o shell veio primeiro."
      />
    </div>
  );
}
