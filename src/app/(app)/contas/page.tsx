import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function ContasPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas"
        description="Contas correntes, poupanças, cartões e carteiras, com saldo consolidado."
      />
      <EmptyState
        title="Nenhuma conta cadastrada"
        description="Tela ainda sem dados: o shell veio primeiro."
      />
    </div>
  );
}
