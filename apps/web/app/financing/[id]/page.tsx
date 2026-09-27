'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PlanDetail {
  id: string;
  months: number;
  depositAmount: string;
  monthlyAmount: string;
  totalAmount: string;
  status: string;
  credentialsDelivered: boolean;
  order: {
    id: string;
    orderNumber: string;
    status: string;
    items: { titleSnapshot: string; priceSnapshot: string }[];
  };
  installments: {
    id: string;
    sequence: number;
    dueDate: string;
    amount: string;
    status: string;
  }[];
}

type Channel = 'WAVE' | 'OM';

const fmt = (n: string | number) =>
  new Intl.NumberFormat('fr-SN').format(Number(n)) + ' FCFA';

const instBadge = (s: string) =>
  ({
    SCHEDULED: 'border-neutral-600/30 bg-neutral-500/10 text-neutral-400',
    PAID: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    OVERDUE: 'border-red-500/30 bg-red-500/10 text-red-400',
  })[s] ?? 'border-neutral-600/30 bg-neutral-500/10 text-neutral-400';

export default function FinancingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [channel, setChannel] = useState<Channel>('WAVE');

  async function load() {
    const token = localStorage.getItem('md_token');
    const res = await fetch(`${API}/api/v1/installments/plans/${id}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (!res.ok) {
      setError('Plan introuvable');
      return;
    }
    setPlan(await res.json());
  }

  useEffect(() => {
    load();
  }, [id]);

  async function onPayNext() {
    setPaying(true);
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(
        `${API}/api/v1/payments/initiate/installment/${id}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ channel }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur');
      // TODO(prod) : rediriger vers data.payment_url (page du canal choisi)
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPaying(false);
    }
  }

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl animate-pulse p-6">
        <div className="h-8 w-1/3 rounded bg-neutral-800" />
        <div className="mt-6 h-64 rounded-xl bg-neutral-800" />
      </main>
    );
  }

  const paidCount = plan.installments.filter((i) => i.status === 'PAID').length;
  const nextDue = plan.installments.find((i) => i.status !== 'PAID') ?? null;
  const needsDeposit =
    plan.order.status === 'PENDING' && !plan.credentialsDelivered;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Mon financement</h1>
        <span
          className={`rounded-full border px-3 py-1 text-xs ${instBadge(
            plan.status === 'COMPLETED' ? 'PAID' : 'SCHEDULED',
          )}`}
        >
          {plan.status}
        </span>
      </div>

      <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <p className="mb-1 text-sm text-neutral-400">
          Commande {plan.order.orderNumber}
        </p>
        {plan.order.items.map((i) => (
          <p key={i.titleSnapshot} className="font-semibold">
            {i.titleSnapshot}
          </p>
        ))}
        <div className="mt-4 grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-neutral-950 p-3">
            <p className="text-xs text-neutral-500">Apport</p>
            <p className="font-bold">{fmt(plan.depositAmount)}</p>
          </div>
          <div className="rounded-lg bg-neutral-950 p-3">
            <p className="text-xs text-neutral-500">Mensualité</p>
            <p className="font-bold">{fmt(plan.monthlyAmount)}</p>
          </div>
          <div className="rounded-lg bg-neutral-950 p-3">
            <p className="text-xs text-neutral-500">Total</p>
            <p className="font-bold text-emerald-400">{fmt(plan.totalAmount)}</p>
          </div>
        </div>
      </div>

      {plan.credentialsDelivered && (
        <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
          ✅ Identifiants remis — consultez-les sur{' '}
          <Link
            href={`/orders/${plan.order.id}`}
            className="text-emerald-400 hover:underline"
          >
            la page de votre commande
          </Link>
        </div>
      )}

      {/* Paiement + choix du moyen : Wave ou Orange Money */}
      {plan.status === 'ACTIVE' && (
        <section className="mb-6 space-y-4">
          <h2 className="text-sm font-semibold text-neutral-300">
            Moyen de paiement
          </h2>
          <div className="grid grid-cols-2 gap-3">
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

          <button
            onClick={onPayNext}
            disabled={paying}
            className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {paying
              ? 'Redirection…'
              : needsDeposit
                ? `Payer l'apport de ${fmt(plan.depositAmount)}${
                    channel === 'WAVE' ? ' par Wave' : ' par Orange Money'
                  }`
                : nextDue
                  ? `Payer l'échéance ${nextDue.sequence} — ${fmt(nextDue.amount)}${
                      channel === 'WAVE' ? ' par Wave' : ' par Orange Money'
                    }`
                  : 'Plan soldé'}
          </button>
        </section>
      )}

      {/* Échéancier */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 font-semibold">
          Échéancier ({paidCount}/{plan.months} réglées)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-500">
                <th className="pb-2">Échéance</th>
                <th className="pb-2">Date limite</th>
                <th className="pb-2">Montant</th>
                <th className="pb-2">Statut</th>
              </tr>
            </thead>
            <tbody>
              {plan.installments.map((i) => (
                <tr key={i.id} className="border-b border-neutral-800/50">
                  <td className="py-2">
                    {i.sequence}/{plan.months}
                  </td>
                  <td className="py-2">
                    {new Date(i.dueDate).toLocaleDateString('fr-SN')}
                  </td>
                  <td className="py-2">{fmt(i.amount)}</td>
                  <td className="py-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${instBadge(i.status)}`}
                    >
                      {i.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}