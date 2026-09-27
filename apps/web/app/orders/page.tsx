'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface OrderRow {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: string;
  items: { id: string; titleSnapshot: string }[];
}

const fmt = (n: string | number) =>
  new Intl.NumberFormat('fr-SN').format(Number(n)) + ' FCFA';

const badge = (s: string) =>
  ({
    PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    CREDENTIALS_DELIVERED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    COMPLETED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    CANCELLED: 'bg-red-500/10 text-red-400 border-red-500/30',
  })[s] ?? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('md_token');
    fetch(`${API}/api/v1/orders/me`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Erreur de chargement');
        const data = await r.json();
        setOrders(data.items);
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

  if (!orders) {
    return (
      <main className="mx-auto max-w-3xl animate-pulse p-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="mb-4 h-24 rounded-xl bg-neutral-800" />
        ))}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Mes commandes</h1>

      {orders.length === 0 ? (
        <p className="text-neutral-400">
          Aucune commande.{' '}
          <Link href="/catalog" className="text-emerald-400 hover:underline">
            Parcourir le catalogue
          </Link>
        </p>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block rounded-xl border border-neutral-800 bg-neutral-900 p-5 transition hover:border-emerald-400/60"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">{o.orderNumber}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs ${badge(o.status)}`}
                >
                  {o.status}
                </span>
              </div>
              <p className="mb-2 text-sm text-neutral-400">
                {o.items.map((i) => i.titleSnapshot).join(' · ')}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="text-neutral-500">
                  {new Date(o.createdAt).toLocaleDateString('fr-SN')}
                </span>
                <span className="font-bold">{fmt(o.total)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}