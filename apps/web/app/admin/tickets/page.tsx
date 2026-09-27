'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface AdminTicketRow {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: { email: string; firstName: string | null; lastName: string | null };
  _count: { messages: number };
}

const badge = (s: string) =>
  ({
    OPEN: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    IN_PROGRESS: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    CLOSED: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
  })[s] ?? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';

export default function AdminTicketsPage() {
  const [tickets, setTickets] = useState<AdminTicketRow[] | null>(null);
  const [status, setStatus] = useState('OPEN');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = localStorage.getItem('md_token');
    const res = await fetch(
      `${API}/api/v1/support/admin/tickets?status=${status}`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    );
    if (!res.ok) {
      setError('Accès refusé');
      return;
    }
    const data = await res.json();
    setTickets(data.items);
  }

  useEffect(() => {
    load();
  }, [status]);

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Tickets support</h1>

      {/* Filtres statut */}
      <div className="mb-6 flex flex-wrap gap-2">
        {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'ALL'].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              status === s
                ? 'border-emerald-400 bg-emerald-500/10 text-emerald-400'
                : 'border-neutral-700 hover:border-neutral-500'
            }`}
          >
            {s === 'ALL' ? 'Tous' : s}
          </button>
        ))}
      </div>

      {!tickets ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-neutral-800" />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucun ticket pour ce filtre.</p>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Link
              key={t.id}
              href={`/support/${t.id}`}
              className="block rounded-xl border border-neutral-800 bg-neutral-900 p-4 transition hover:border-emerald-400/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{t.subject}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${badge(t.status)}`}>
                  {t.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {t.user.email} · {t._count.messages} message(s) · maj{' '}
                {new Date(t.updatedAt).toLocaleDateString('fr-SN')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}