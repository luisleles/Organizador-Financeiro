import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";

export default function ConfiguracoesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Preferências do aplicativo, importação e exportação de dados."
      />
      <Card title="Referências">
        <Link href="/styleguide" className="text-md text-foco underline underline-offset-4">
          Styleguide do design system
        </Link>
      </Card>
    </div>
  );
}
