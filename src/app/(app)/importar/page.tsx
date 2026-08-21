import { PageHeader } from "@/components/shell/page-header";
import { ImportWorkspace } from "@/components/import/import-workspace";
import { Card } from "@/components/ui/card";
import { listAccounts } from "@/server/accounts/account.service";
import { listCategories } from "@/server/categories/category.service";

export const dynamic = "force-dynamic";

export default async function ImportarPage() {
  const [accountList, categories] = await Promise.all([listAccounts(), listCategories()]);

  const accounts = accountList.accounts
    .filter((account) => !account.archived)
    .map((account) => ({ id: account.id, name: account.name }));

  const categoryOptions = categories.flat
    .filter((category) => !category.archived)
    .map((category) => ({ id: category.id, name: category.name }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Importar extrato"
        description="CSV e OFX passam pelo mesmo caminho: o arquivo é lido, o que já existe é marcado como duplicado, as regras sugerem categoria — e nada é gravado antes de você confirmar."
      />

      <ImportWorkspace accounts={accounts} categories={categoryOptions} />

      <Card title="Como funciona por dentro">
        <p className="text-texto-fraco text-sm">
          Cada formato é uma fonte que implementa a mesma interface, e o pipeline seguinte é
          idêntico para todas: normalizar, deduplicar por origem e identificador, aplicar as
          regras de categorização e mostrar esta revisão. Adicionar uma fonte nova — Open
          Finance, por exemplo — é implementar essa interface, e nada mais. O passo a passo está
          em <code className="valor text-xs">docs/IMPORTACAO.md</code>.
        </p>
      </Card>
    </div>
  );
}
