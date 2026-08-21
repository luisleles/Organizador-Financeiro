import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sem conexão · Controle Financeiro",
};

/**
 * Servida pelo service worker quando a rede não responde. Não mostra dado nenhum: o app é
 * do lado do servidor, e qualquer número aqui seria uma cópia velha se passando por saldo.
 */
export default function SemConexaoPage() {
  return (
    <main className="bg-fundo flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <p className="text-2xs text-texto-fraco font-semibold tracking-widest uppercase">
          Controle Financeiro
        </p>
        <h1 className="titulo text-texto text-2xl">Sem conexão com o app</h1>
        <p className="text-texto-fraco text-sm">
          Seus dados moram no computador onde o app roda, e o celular não está alcançando ele agora.
          Nada foi perdido — só não dá para ler nem lançar enquanto a conexão não voltar.
        </p>
        <ul className="text-texto-fraco flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>Confira se o celular está no Wi-Fi de casa, ou com o Tailscale ligado.</li>
          <li>Confira se o computador que roda o app está ligado e acordado.</li>
          <li>Se acabou de mudar de rede, espere alguns segundos e tente de novo.</li>
        </ul>
        {/*
          `<a>` de propósito, e não `<Link>`: esta página é servida pelo service worker
          quando não há rede, e uma navegação do lado do cliente tentaria buscar o RSC da
          rota — que é exatamente o que não está respondendo. O recarregamento inteiro é o
          "tentar de novo" de verdade.
        */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="border-linha text-texto hover:border-linha-forte focus-visible:outline-foco inline-flex min-h-11 w-fit items-center rounded-md border px-4 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Tentar de novo
        </a>
      </div>
    </main>
  );
}
