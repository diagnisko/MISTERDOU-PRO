'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: string;
  items: {
    id: string;
    productId: string;
    titleSnapshot: string;
    priceSnapshot: string;
    product?: { slug: string; title: string } | null;
  }[];
  payments?: { id: string; status: string; amount: string }[];
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

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creds, setCreds] = useState<Record<string, { login: string; password: string }>>({});

  useEffect(() => {
    const token = localStorage.getItem('md_token');
    fetch(`${API}/api/v1/orders/${id}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('Commande introuvable');
        setOrder(await r.json());
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  async function reveal(productId: string) {
    const token = localStorage.getItem('md_token');
    const res = await fetch(
      `${API}/api/v1/orders/${id}/credentials/${productId}`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    );
    if (res.ok) {
      setCreds((c) => ({ ...c, [productId]: await res.json() }));
    }
  }

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="mx-auto max-w-2xl animate-pulse p-6">
        <div className="h-8 w-1/3 rounded bg-neutral-800" />
        <div className="mt-6 h-48 rounded-xl bg-neutral-800" />
      </main>
    );
  }

  const delivered = ['CREDENTIALS_DELIVERED', 'COMPLETED'].includes(order.status);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">{order.orderNumber}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${badge(order.status)}`}>
          {order.status}
        </span>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        {order.items.map((item) => (
          <div
            key={item.id}
            className="border-b border-neutral-800 py-4 last:border-0"
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{item.titleSnapshot}</span>
              <span>{fmt(item.priceSnapshot)}</span>
            </div>

            {delivered ? (
              creds[item.productId] ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="mb-1 text-xs text-neutral-400">
                    Identifiants eFootball :
                  </p>
                  <p className="font-mono text-sm">
                    Login : <strong>{creds[item.productId].login}</strong>
                  </p>
                  <p className="font-mono text-sm">
                    Mot de passe : <strong>{creds[item.productId].password}</strong>
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => reveal(item.productId)}
                  className="rounded-lg border border-emerald-500/40 px-4 py-1.5 text-sm text-emerald-400 hover:bg-emerald-500/10"
                >
                  👁 Révéler mes identifiants
                </button>
              )
            ) : order.status === 'PENDING' ? (
              <Link
                href={`/orders/${order.id}/checkout`}
                className="text-sm text-emerald-400 hover:underline"
              >
                → Payer maintenant
              </Link>
            ) : null}
          </div>
        ))}

        <div className="mt-4 flex justify-between border-t border-neutral-800 pt-4 font-bold">
          <span>Total</span>
          <span className="text-emerald-400">{fmt(order.total)}</span>
        </div>
      </div>
    </main>
  );
}