'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface DashboardData {
  totals: { users: number; ordersCompleted: number };
  queues: {
    sellersPending: number;
    productsPending: number;
    kycPending: number;
    withdrawalsPending: number;
    disputesOpen: number;
  };
  finance: { revenue: number; commissions: number; sellerPayouts: number };
}

const fmt = (n: number) => new Intl.NumberFormat('fr-SN').format(Math.round(n));

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('md_token');
    fetch(`${API}/api/v1/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Accès refusé');
        setData(await r.json());
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

  if (!data) {
    return (
      <main className="mx-auto max-w-5xl animate-pulse p-6">
        <div className="mb-6 h-8 w-1/3 rounded bg-neutral-800" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-neutral-800" />
          ))}
        </div>
      </main>
    );
  }

  const queueCards = [
    { label: 'KYC à vérifier', value: data.queues.kycPending, href: '/admin/kyc' },
    { label: 'Offres à valider', value: data.queues.productsPending, href: '/admin/products' },
    { label: 'Vendeurs à approuver', value: data.queues.sellersPending, href: '/admin/sellers' },
    { label: 'Retraits à traiter', value: data.queues.withdrawalsPending, href: '/admin/withdrawals' },
    { label: 'Litiges ouverts', value: data.queues.disputesOpen, href: '/admin/tickets' },
  ];

  const financeCards = [
    { label: 'CA encaissé (FCFA)', value: fmt(data.finance.revenue) },
    { label: 'Commissions (FCFA)', value: fmt(data.finance.commissions) },
    { label: 'Versements vendeurs (FCFA)', value: fmt(data.finance.sellerPayouts) },
  ];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Centre d&apos;administration</h1>

      {/* Finance */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Finance
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {financeCards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4"
            >
              <p className="text-xs text-neutral-400">{c.label}</p>
              <p className="text-2xl font-bold text-emerald-400">{c.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Files de revue */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Files de revue
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queueCards.map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-emerald-400/60"
            >
              <p className="mb-1 text-xs text-neutral-400">{c.label}</p>
              <p className="text-3xl font-bold">{c.value}</p>
              {c.value > 0 && (
                <p className="mt-1 text-xs text-amber-400">Action requise →</p>
              )}
            </Link>
          ))}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <p className="mb-1 text-xs text-neutral-400">Utilisateurs</p>
            <p className="text-3xl font-bold">{fmt(data.totals.users)}</p>
            <p className="mt-1 text-xs text-neutral-500">
              {fmt(data.totals.ordersCompleted)} commandes livrées
            </p>
          </div>
        </div>
      </section>

      {/* Navigation */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/audit-logs"
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-400/60"
        >
          <h3 className="mb-1 font-semibold">📜 Journaux d&apos;audit</h3>
          <p className="text-sm text-neutral-400">
            Toutes les actions admin, traçabilité complète.
          </p>
        </Link>
        <Link
          href="/admin/users"
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-400/60"
        >
          <h3 className="mb-1 font-semibold">👥 Utilisateurs</h3>
          <p className="text-sm text-neutral-400">
            Recherche par e-mail, rôle, statut KYC.
          </p>
        </Link>
        <Link
          href="/admin/stats"
          className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-400/60"
        >
          <h3 className="mb-1 font-semibold">📊 Statistiques</h3>
          <p className="text-sm text-neutral-400">
            CA par canal (Wave / Orange Money) et par mois.
          </p>
        </Link>
      </section>
    </main>
  );
}