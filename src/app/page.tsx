import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-3 px-6">
      <h1 className="font-display text-3xl">Controle Financeiro</h1>
      <p className="text-md text-texto-fraco">Design system definido. Telas a seguir.</p>
      <Link href="/styleguide" className="text-md text-foco underline underline-offset-4">
        Ver styleguide
      </Link>
    </main>
  );
}
