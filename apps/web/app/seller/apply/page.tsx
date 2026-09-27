'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function SellerApplyPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(`${API}/api/v1/sellers/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ shopName, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur');
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 text-6xl">⏳</div>
        <h1 className="mb-2 text-2xl font-bold">Candidature envoyée !</h1>
        <p className="mb-6 text-neutral-400">
          Votre demande est en attente de validation par l&apos;équipe MISTERDOU.
          Vous recevrez une notification dès qu&apos;elle sera traitée.
        </p>
        <button
          onClick={() => router.push('/')}
          className="rounded-lg border border-neutral-700 px-6 py-2 hover:border-emerald-400"
        >
          Retour à l&apos;accueil
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Devenir vendeur</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Votre identité doit être vérifiée (KYC approuvé) avant de candidater.
        Une fois votre boutique validée, vous pourrez publier des offres de
        comptes eFootball.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-neutral-300">
            Nom de la boutique
          </label>
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            required
            minLength={3}
            maxLength={60}
            placeholder="Ex : DouGaming Store"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 focus:border-emerald-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-neutral-300">
            Description (optionnel)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Décrivez votre boutique, votre expérience…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 focus:border-emerald-400 focus:outline-none"
          />
        </div>

        {error && (
          <p className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || shopName.length < 3}
          className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {loading ? 'Envoi…' : 'Envoyer ma candidature'}
        </button>
      </form>
    </main>
  );
}