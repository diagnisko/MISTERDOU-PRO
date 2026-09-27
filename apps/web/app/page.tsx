export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-5xl font-extrabold text-transparent">
        MISTERDOU-PRO
      </h1>
      <p className="max-w-xl text-center text-lg text-neutral-400">
        La marketplace sécurisée d&apos;achat et de vente de comptes eFootball.
      </p>
      <div className="flex gap-4">
        <a
          href="/auth/login"
          className="rounded-lg bg-emerald-500 px-6 py-3 font-semibold text-neutral-950 transition hover:bg-emerald-400"
        >
          Se connecter
        </a>
        <a
          href="/auth/register"
          className="rounded-lg border border-neutral-700 px-6 py-3 font-semibold transition hover:border-emerald-400"
        >
          Créer un compte
        </a>
      </div>
    </main>
  );
}
