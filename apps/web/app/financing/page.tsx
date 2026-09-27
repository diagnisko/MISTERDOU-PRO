'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PlanRow {
  id: string;
  months: number;
  monthlyAmount: string;
  totalAmount: string;
  status: string;
  order: { orderNumber: string; status: string };
  installments: { status: string }[];
}

const fmt = (n: string | number) =>
  new Intl.NumberFormat('fr-SN').format(Number(n)) + ' FCFA';

export default function MyFinancingPage() {
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('md_token');
    fetch(`${API}/api/v1/installments/me`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Erreur de chargement');
        const data = await r.json();
        setPlans(data.items);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!plans) {
    return (
      <main className="mx-auto max-w-2xl animate-pulse p-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="mb-4 h-24 rounded-xl bg-neutral-800" />
        ))}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Mes financements</h1>

      {plans.length === 0 ? (
        <p className="text-neutral-400">
          Aucun financement en cours.{' '}
          <Link href="/catalog" className="text-emerald-400 hover:underline">
            Parcourir le catalogue
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {plans.map((p) => {
            const paid = p.installments.filter((i) => i.status === 'PAID').length;
            return (
              <Link
                key={p.id}
                href={`/financing/${p.id}`}
                className="block rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-400/60"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{p.order.orderNumber}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs ${
                      p.status === 'COMPLETED'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="mb-2 text-sm text-neutral-400">
                  {p.months} mois · {paid}/{p.installments.length} échéances réglées
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">
                    {fmt(p.monthlyAmount)} / mois
                  </span>
                  <span className="font-bold">{fmt(p.totalAmount)} total</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}