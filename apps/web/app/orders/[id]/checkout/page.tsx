'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: string;
  total: string;
  items: { id: string; titleSnapshot: string; priceSnapshot: string }[];
}

type Channel = 'WAVE' | 'OM';

const fmt = (n: string | number) =>
  new Intl.NumberFormat('fr-SN').format(Number(n)) + ' FCFA';

export default function CheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [channel, setChannel] = useState<Channel>('WAVE');

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

  async function onPay() {
    setPaying(true);
    setError(null);
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(`${API}/api/v1/payments/initiate/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ channel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur paiement');
      // TODO(prod) : rediriger vers data.payment_url (page du canal choisi)
      router.push('/orders');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(false);
    }
  }

  async function onCancel() {
    const token = localStorage.getItem('md_token');
    await fetch(`${API}/api/v1/orders/${id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    router.push('/catalog');
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
      <main className="mx-auto max-w-xl animate-pulse p-6">
        <div className="h-8 w-1/2 rounded bg-neutral-800" />
        <div className="mt-6 h-40 rounded-xl bg-neutral-800" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-1 text-3xl font-bold">Paiement</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Commande {order.orderNumber} · ⏳ réservée 15 minutes
      </p>

      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <ul className="mb-4 divide-y divide-neutral-800">
          {order.items.map((i) => (
            <li key={i.id} className="flex justify-between py-2 text-sm">
              <span className="text-neutral-300">{i.titleSnapshot}</span>
              <span>{fmt(i.priceSnapshot)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-neutral-800 pt-3 font-bold">
          <span>Total</span>
          <span className="text-emerald-400">{fmt(order.total)}</span>
        </div>
      </div>

      {/* Choix du moyen de paiement : Wave ou Orange Money uniquement */}
      <h2 className="mb-3 text-sm font-semibold text-neutral-300">
        Choisissez votre moyen de paiement
      </h2>
      <div className="mb-6 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setChannel('WAVE')}
          className={`rounded-xl border p-4 text-left transition ${
            channel === 'WAVE'
              ? 'border-sky-400 bg-sky-400/10'
              : 'border-neutral-700 hover:border-neutral-500'
          }`}
        >
          <span className="mb-1 block font-semibold">🌊 Wave</span>
          <span className="text-xs text-neutral-400">
            Paiement instantané par Wave
          </span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('OM')}
          className={`rounded-xl border p-4 text-left transition ${
            channel === 'OM'
              ? 'border-orange-400 bg-orange-400/10'
              : 'border-neutral-700 hover:border-neutral-500'
          }`}
        >
          <span className="mb-1 block font-semibold">🟠 Orange Money</span>
          <span className="text-xs text-neutral-400">
            Paiement instantané par Orange Money
          </span>
        </button>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <button
          onClick={onPay}
          disabled={paying || order.status !== 'PENDING'}
          className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-50"
        >
          {paying
            ? 'Redirection…'
            : channel === 'WAVE'
              ? `Payer ${fmt(order.total)} par Wave`
              : `Payer ${fmt(order.total)} par Orange Money`}
        </button>
        <button
          onClick={onCancel}
          className="w-full rounded-lg border border-neutral-700 py-2 text-sm text-neutral-400 hover:border-red-500/50 hover:text-red-400"
        >
          Annuler la commande
        </button>
      </div>
    </main>
  );
}