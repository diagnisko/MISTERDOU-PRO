'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Withdrawal {
  id: string;
  amount: string;
  status: string;
  method: string;
  destination: string;
  fee: string;
  requestedAt: string;
}

interface SellerProfile {
  id: string;
  shopName: string;
  slug: string;
  status: string;
  balance: string;
  pendingBalance: string;
  totalSales: string;
  rating: string | null;
  salesCount: number;
  withdrawals: Withdrawal[];
}

const fmt = (n: string | number) =>
  new Intl.NumberFormat('fr-SN').format(Number(n)) + ' FCFA';

const statusBadge = (s: string) =>
  ({
    PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    APPROVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    PAID: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    REJECTED: 'bg-red-500/10 text-red-400 border-red-500/30',
  })[s] ?? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';

export default function SellerDashboardPage() {
  const [profile, setProfile] = useState<SellerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Formulaire retrait
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('WAVE');
  const [destination, setDestination] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function loadProfile() {
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(`${API}/api/v1/sellers/me`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          setError('NO_SELLER');
          return;
        }
        throw new Error('Erreur de chargement');
      }
      setProfile(await res.json());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    loadProfile();
  }, []);

  async function onWithdraw(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMsg(null);
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(`${API}/api/v1/sellers/me/withdrawals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ amount: Number(amount), method, destination }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur');
      setMsg(`Demande envoyée — net à recevoir : ${fmt(data.netAmount)}`);
      setAmount('');
      setDestination('');
      loadProfile();
    } catch (err) {
      setMsg(`❌ ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  }

  if (error === 'NO_SELLER') {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center p-6 text-center">
        <div className="mb-4 text-6xl">🏪</div>
        <h1 className="mb-2 text-2xl font-bold">Pas encore vendeur</h1>
        <p className="mb-6 text-neutral-400">
          Envoyez votre candidature pour ouvrir votre boutique.
        </p>
        <Link
          href="/seller/apply"
          className="rounded-lg bg-emerald-500 px-6 py-2 font-semibold text-neutral-950 hover:bg-emerald-400"
        >
          Devenir vendeur
        </Link>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="mx-auto max-w-4xl animate-pulse p-6">
        <div className="mb-6 h-8 w-1/3 rounded bg-neutral-800" />
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-neutral-800" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{profile.shopName}</h1>
          <p className="text-sm text-neutral-400">
            Statut :{' '}
            <span
              className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(profile.status)}`}
            >
              {profile.status}
            </span>
          </p>
        </div>
        <Link
          href={`/shops/${profile.slug}`}
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-emerald-400"
        >
          Voir ma boutique publique →
        </Link>
      </div>

      {/* Soldes */}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <p className="text-xs text-neutral-400">Solde disponible</p>
          <p className="text-2xl font-bold text-emerald-400">
            {fmt(profile.balance)}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-400">En séquestre</p>
          <p className="text-2xl font-bold">{fmt(profile.pendingBalance)}</p>
        </div>
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-400">Ventes totales</p>
          <p className="text-2xl font-bold">{fmt(profile.totalSales)}</p>
          <p className="text-xs text-neutral-500">
            {profile.salesCount} ventes · ⭐ {profile.rating ?? '—'}
          </p>
        </div>
      </div>

      {/* Demande de retrait */}
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 text-xl font-semibold">Demander un retrait</h2>
        <form onSubmit={onWithdraw} className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Montant (FCFA)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              min={1000}
              placeholder="5000"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Méthode
            </label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2"
            >
              <option value="WAVE">Wave</option>
              <option value="OM">Orange Money</option>
              <option value="BANK">Virement bancaire</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Destination
            </label>
            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              required
              minLength={4}
              placeholder="Numéro Wave/OM ou IBAN"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 focus:border-emerald-400 focus:outline-none"
            />
          </div>
          <p className="col-span-full text-xs text-neutral-500">
            Frais fixes : 200 FCFA par retrait. Le montant est mis en séquestre
            jusqu&apos;au paiement par l&apos;équipe.
          </p>
          {msg && <p className="col-span-full text-sm text-neutral-300">{msg}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 py-2 font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50 sm:col-span-3"
          >
            {submitting ? 'Envoi…' : 'Demander le retrait'}
          </button>
        </form>
      </section>

      {/* Historique retraits */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="mb-4 text-xl font-semibold">Mes retraits</h2>
        {profile.withdrawals.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun retrait pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800 text-left text-neutral-500">
                  <th className="pb-2">Date</th>
                  <th className="pb-2">Montant</th>
                  <th className="pb-2">Frais</th>
                  <th className="pb-2">Méthode</th>
                  <th className="pb-2">Statut</th>
                </tr>
              </thead>
              <tbody>
                {profile.withdrawals.map((w) => (
                  <tr key={w.id} className="border-b border-neutral-800/50">
                    <td className="py-2">
                      {new Date(w.requestedAt).toLocaleDateString('fr-SN')}
                    </td>
                    <td className="py-2">{fmt(w.amount)}</td>
                    <td className="py-2 text-neutral-500">{fmt(w.fee)}</td>
                    <td className="py-2">{w.method}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(w.status)}`}
                      >
                        {w.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}