'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Options identiques à l'API (INSTALLMENT_OPTIONS)
const OPTIONS: Record<number, number> = { 2: 0.3, 3: 0.3, 4: 0.4 };

interface Props {
  productIds: string[];
  total: number;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-SN').format(Math.round(n)) + ' FCFA';

export default function FinancingOptions({ productIds, total }: Props) {
  const router = useRouter();
  const [months, setMonths] = useState<2 | 3 | 4>(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rate = OPTIONS[months];
  const deposit = total * rate;
  const monthly = (total - deposit) / months;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(`${API}/api/v1/installments/plans`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ productIds, months }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur');
      router.push(`/financing/${data.planId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
    >
      <h3 className="mb-3 font-semibold">💳 Payer en plusieurs fois</h3>
      <p className="mb-4 text-xs text-neutral-500">
        Offres MISTERDOU uniquement. Identifiants remis dès l&apos;apport payé.
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {([2, 3, 4] as const).map((m) => (
          <button
            type="button"
            key={m}
            onClick={() => setMonths(m)}
            className={`rounded-lg border py-2 text-sm transition ${
              months === m
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400'
                : 'border-neutral-700 hover:border-neutral-500'
            }`}
          >
            {m} mois
            <span className="block text-[10px] text-neutral-500">
              apport {OPTIONS[m] * 100} %
            </span>
          </button>
        ))}
      </div>

      <div className="mb-4 space-y-1 rounded-lg bg-neutral-950 p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-400">Apport initial</span>
          <span className="font-semibold">{fmt(deposit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-neutral-400">
            Puis {months} mensualités de
          </span>
          <span className="font-semibold">{fmt(monthly)}</span>
        </div>
        <div className="flex justify-between border-t border-neutral-800 pt-1">
          <span className="text-neutral-400">Total</span>
          <span className="font-bold">{fmt(total)}</span>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-red-500/50 bg-red-500/10 p-2 text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-emerald-500 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
      >
        {loading ? 'Création du plan…' : `Choisir ${months} mois`}
      </button>
    </form>
  );
}