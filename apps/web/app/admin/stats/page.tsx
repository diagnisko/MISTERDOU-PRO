'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface AuditRow {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actor: { email: string; role: string } | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

const CHANNEL_LABELS: Record<string, string> = {
  WAVE: '🌊 Wave',
  OM: '🟠 Orange Money',
};

export default function AdminStatsPage() {
  const [byChannel, setByChannel] = useState<{ channel: string; count: number; total: number }[] | null>(null);
  const [monthly, setMonthly] = useState<{ month: string; total: number }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('md_token');
    const headers = { Authorization: `Bearer ${token ?? ''}` };
    Promise.all([
      fetch(`${API}/api/v1/admin/stats/revenue-by-channel`, { headers }),
      fetch(`${API}/api/v1/admin/stats/revenue-monthly`, { headers }),
    ])
      .then(async ([c, m]) => {
        if (!c.ok || !m.ok) throw new Error('Accès refusé');
        setByChannel(await c.json());
        setMonthly(await m.json());
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

  const fmt = (n: number) => new Intl.NumberFormat('fr-SN').format(Math.round(n));
  const maxMonthly = monthly ? Math.max(...monthly.map((m) => m.total), 1) : 1;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Statistiques</h1>

      {/* CA par canal */}
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 font-semibold">CA par moyen de paiement</h2>
        {!byChannel ? (
          <div className="h-24 animate-pulse rounded bg-neutral-800" />
        ) : byChannel.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun paiement encaissé pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-500">
                <th className="pb-2">Canal</th>
                <th className="pb-2">Paiements</th>
                <th className="pb-2">Total encaissé</th>
              </tr>
            </thead>
            <tbody>
              {byChannel.map((c) => (
                <tr key={c.channel} className="border-b border-neutral-800/50">
                  <td className="py-2 font-semibold">
                    {CHANNEL_LABELS[c.channel] ?? c.channel}
                  </td>
                  <td className="py-2">{c.count}</td>
                  <td className="py-2 font-bold">{fmt(c.total)} FCFA</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* CA mensuel — barres simples */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 font-semibold">CA des 6 derniers mois</h2>
        {!monthly ? (
          <div className="h-40 animate-pulse rounded bg-neutral-800" />
        ) : monthly.length === 0 ? (
          <p className="text-sm text-neutral-500">Pas encore de données.</p>
        ) : (
          <div className="flex h-40 items-end gap-3">
            {monthly.map((m) => (
              <div key={m.month} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t bg-emerald-500/80"
                  style={{ height: `${(m.total / maxMonthly) * 100}%` }}
                  title={`${fmt(m.total)} FCFA`}
                />
                <span className="text-[10px] text-neutral-500">
                  {new Date(m.month).toLocaleDateString('fr-SN', {
                    month: 'short',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}