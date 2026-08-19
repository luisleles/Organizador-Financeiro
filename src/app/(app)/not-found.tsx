import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      title="Não encontramos esta página"
      description="O endereço não existe ou o registro foi removido."
      action={
        <Link href="/" className="text-md text-foco underline underline-offset-4">
          Voltar para o início
        </Link>
      }
    />
  );
}
