import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { DisplayPreferences } from "@/components/settings/display-preferences";
import { EraseDataDialog } from "@/components/settings/erase-data-dialog";
import { SignOutButton } from "@/components/settings/sign-out-button";
import { Card } from "@/components/ui/card";
import { auth } from "@/auth";
import { readValuesHidden } from "@/server/preferences";

export const dynamic = "force-dynamic";

export default async function ConfiguracoesPage() {
  const [session, valuesHidden] = await Promise.all([auth(), readValuesHidden()]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Acesso, preferências de exibição, exportação de dados e backup."
        action={<SignOutButton />}
      />

      <Card title="Conta">
        <div className="flex flex-col gap-4">
          <p className="text-texto-fraco text-sm">
            Entrando como{" "}
            <span className="text-texto">{session?.user?.email ?? "sessão desconhecida"}</span>. O
            app é de uma pessoa só: não há outras contas para gerenciar.
          </p>
          <ChangePasswordForm />
        </div>
      </Card>

      <Card title="Exibição">
        <DisplayPreferences valuesHidden={valuesHidden} />
      </Card>

      <Card title="Exportar tudo">
        <div className="flex flex-col gap-4">
          <p className="text-texto-fraco text-sm">
            A exportação completa não tem recorte de período nem de conta: sai tudo o que está no
            banco. O CSV abre direto no Excel; o JSON preserva a estrutura inteira, com os valores
            em centavos.
          </p>
          <div className="flex flex-wrap gap-2">
            <DownloadLink href="/api/exportar/csv" label="Baixar CSV" />
            <DownloadLink href="/api/exportar/json" label="Baixar JSON" />
          </div>
        </div>
      </Card>

      <Card title="Backup do banco">
        <div className="flex flex-col gap-4">
          <p className="text-texto-fraco text-sm">
            Gera uma cópia consistente do arquivo SQLite, feita com <code>VACUUM INTO</code> — o app
            pode continuar aberto durante a cópia. Guarde o arquivo fora desta máquina.
          </p>
          <DownloadLink href="/api/backup" label="Gerar backup" />
          <div className="border-linha flex flex-col gap-2 border-t pt-4">
            <p className="text-2xs text-texto-fraco font-semibold uppercase">Para restaurar</p>
            <p className="text-texto-fraco text-sm">
              Feche o app, troque o arquivo do banco pelo backup e abra de novo:
            </p>
            <pre className="border-linha bg-fundo text-texto overflow-x-auto rounded-md border px-3 py-2 text-xs">
              <code>{RESTORE_COMMAND}</code>
            </pre>
            <p className="text-texto-fraco text-xs">
              O passo a passo completo, incluindo o caso de o backup ser de uma versão anterior do
              schema, está em <code className="valor">docs/IMPORTACAO.md</code>.
            </p>
          </div>
        </div>
      </Card>

      <Card title="Zona de perigo">
        <div className="flex flex-col gap-4">
          <p className="text-texto-fraco text-sm">
            Apaga todo o histórico financeiro deste app — lançamentos, contas, categorias, tags,
            orçamentos, metas e recorrências. A conta de acesso continua, e não há como desfazer.
          </p>
          <EraseDataDialog />
        </div>
      </Card>

      <Card title="Referências">
        <Link href="/styleguide" className="text-md text-foco underline underline-offset-4">
          Styleguide do design system
        </Link>
      </Card>
    </div>
  );
}

const RESTORE_COMMAND = `bash scripts/fechar-app.sh
cp data/app.db data/app.db.antes-da-restauracao
cp ~/Downloads/controle-financeiro-AAAA-MM-DD.db data/app.db
npx prisma migrate deploy`;

function DownloadLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="border-linha text-texto hover:border-linha-forte focus-visible:outline-foco inline-flex w-fit items-center self-start rounded-md border px-3 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {label}
    </a>
  );
}
