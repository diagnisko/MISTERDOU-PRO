'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface TicketRow {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count: { messages: number };
  order: { orderNumber: string } | null;
}

const badge = (s: string) =>
  ({
    OPEN: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    IN_PROGRESS: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    CLOSED: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
  })[s] ?? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';

export default function SupportPage() {
  const [tickets, setTickets] = useState<TicketRow[] | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [orderId, setOrderId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('md_token');
    fetch(`${API}/api/v1/support/tickets/me`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    })
      .then(async (r) => {
        const data = await r.json();
        setTickets(data.items ?? []);
      })
      .catch(() => setTickets([]));
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setMsg(null);
    const token = localStorage.getItem('md_token');
    try {
      const res = await fetch(`${API}/api/v1/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          subject,
          body,
          orderId: orderId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? 'Erreur');
      setMsg('✅ Ticket créé — notre équipe vous répond rapidement.');
      setSubject('');
      setBody('');
      setOrderId('');
      // recharge la liste
      const list = await fetch(`${API}/api/v1/support/tickets/me`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      }).then((r) => r.json());
      setTickets(list.items ?? []);
    } catch (err) {
      setMsg(`❌ ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Support</h1>

      {/* Nouveau ticket */}
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="mb-4 font-semibold">Ouvrir un ticket</h2>
        <form onSubmit={onCreate} className="space-y-3">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            required
            minLength={4}
            maxLength={120}
            placeholder="Sujet (ex : Problème de connexion au compte acheté)"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          />
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder="ID commande (optionnel — visible sur mes commandes)"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={4}
            maxLength={4000}
            placeholder="Décrivez votre problème…"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          />
          {msg && <p className="text-sm text-neutral-300">{msg}</p>}
          <button
            type="submit"
            disabled={creating || subject.length < 4 || !body}
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {creating ? 'Création…' : 'Envoyer'}
          </button>
        </form>
      </section>

      {/* Mes tickets */}
      <section>
        <h2 className="mb-4 font-semibold">Mes tickets</h2>
        {!tickets ? (
          <div className="animate-pulse space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-neutral-800" />
            ))}
          </div>
        ) : tickets.length === 0 ? (
          <p className="text-sm text-neutral-500">Aucun ticket ouvert.</p>
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
                  {t._count.messages} message(s)
                  {t.order ? ` · commande ${t.order.orderNumber}` : ''} · mis à jour{' '}
                  {new Date(t.updatedAt).toLocaleDateString('fr-SN')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}