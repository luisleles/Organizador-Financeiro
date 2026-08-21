import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";
import { hasAnyUser } from "@/server/auth/auth.service";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrar · Controle Financeiro",
};

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const destino = typeof params.destino === "string" ? params.destino : "/";
  const primeiraExecucao = !(await hasAnyUser());

  return (
    <main className="bg-fundo flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="flex w-full max-w-sm flex-col gap-8">
        <header className="flex flex-col gap-2">
          <p className="text-2xs text-texto-fraco font-semibold tracking-widest uppercase">
            Controle Financeiro
          </p>
          <h1 className="titulo text-texto text-2xl">
            {primeiraExecucao ? "Crie seu acesso" : "Entrar"}
          </h1>
          <p className="text-texto-fraco text-sm">
            {primeiraExecucao
              ? "Este app é de uma pessoa só. Esta conta é criada uma vez, nesta máquina, e depois esta tela vira o login."
              : "Seus dados ficam neste computador. A sessão dura 30 dias."}
          </p>
        </header>

        <LoginForm primeiraExecucao={primeiraExecucao} destino={destino} />
      </div>
    </main>
  );
}
