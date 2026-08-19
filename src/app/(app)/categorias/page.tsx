import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export default function CategoriasPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Categorias"
        description="Categorias e subcategorias de entrada e saída, em um nível de hierarquia."
      />
      <EmptyState
        title="Nenhuma categoria cadastrada"
        description="Tela ainda sem dados: o shell veio primeiro."
      />
    </div>
  );
}
