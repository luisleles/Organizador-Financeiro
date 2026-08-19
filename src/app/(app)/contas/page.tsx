import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { AccountFormDialog } from "@/components/accounts/account-form-dialog";
import { AccountTable } from "@/components/accounts/account-table";
import { ConsolidatedBalanceCard } from "@/components/accounts/consolidated-balance-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listAccounts } from "@/server/accounts/account.service";
import { readValuesHidden } from "@/server/preferences";
import { createAccountAction } from "./actions";

type ContasPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ContasPage({ searchParams }: ContasPageProps) {
  const params = await searchParams;
  const includeArchived = params.arquivadas === "1";

  const [{ accounts, consolidated }, valuesHidden] = await Promise.all([
    listAccounts({ includeArchived }),
    readValuesHidden(),
  ]);

  const activeAccountCount = accounts.filter((account) => !account.archived).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Contas"
        description="Saldo de cada conta no momento: saldo inicial mais tudo que foi lançado. Não depende do período selecionado."
        action={<AccountFormDialog action={createAccountAction} label="Nova conta" variant="primary" />}
      />

      <ConsolidatedBalanceCard
        consolidated={consolidated}
        activeAccountCount={activeAccountCount}
        valuesHidden={valuesHidden}
      />

      {accounts.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Cadastre a primeira conta com o saldo do dia de hoje. A partir dele, cada lançamento move o saldo."
          action={
            <AccountFormDialog
              action={createAccountAction}
              label="Cadastrar conta"
              variant="primary"
            />
          }
        />
      ) : (
        <Card
          title="Suas contas"
          action={
            <Link
              href={includeArchived ? "/contas" : "/contas?arquivadas=1"}
              className="text-xs text-texto-fraco hover:text-texto"
            >
              {includeArchived ? "Ocultar arquivadas" : "Mostrar arquivadas"}
            </Link>
          }
          className="overflow-hidden"
        >
          <AccountTable accounts={accounts} valuesHidden={valuesHidden} />
        </Card>
      )}
    </div>
  );
}
