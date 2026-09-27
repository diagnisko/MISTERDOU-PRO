'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  createdAt: string;
  order: { id: string; orderNumber: string } | null;
  user: { email: string } | null;
  messages: {
    id: string;
    senderId: string | null;
    body: string;
    isStaff: boolean;
    createdAt: string;
  }[];
}

const badge = (s: string) =>
  ({
    OPEN: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    IN_PROGRESS: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    CLOSED: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
  })[s] ?? 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30';

export default function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    const token = localStorage.getItem('md_token');
    const res = await fetch(`${API}/api/v1/support/tickets/${id}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (!res.ok) {
      setError('Ticket introuvable');
      return;
    }
    setTicket(await res.json());
  }

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages.length]);

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    const token = localStorage.getItem('md_token');
    // Réponse client ; si staff (page admin), la route staff est utilisée
    const isAdmin = location.pathname.startsWith('/admin');
    await fetch(
      `${API}/api/v1/support/${isAdmin ? 'admin/tickets' : 'tickets'}/${id}/reply`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ body: reply }),
      },
    );
    setReply('');
    await load();
    setSending(false);
  }

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!ticket) {
    return (
      <main className="mx-auto max-w-2xl animate-pulse p-6">
        <div className="h-8 w-1/2 rounded bg-neutral-800" />
        <div className="mt-6 h-64 rounded-xl bg-neutral-800" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{ticket.subject}</h1>
        <span className={`rounded-full border px-3 py-1 text-xs ${badge(ticket.status)}`}>
          {ticket.status}
        </span>
      </div>
      {ticket.order && (
        <p className="mb-4 text-sm text-neutral-400">
          Commande liée :{' '}
          <Link
            href={`/orders/${ticket.order.id}`}
            className="text-emerald-400 hover:underline"
          >
            {ticket.order.orderNumber}
          </Link>
        </p>
      )}

      {/* Conversation */}
      <div className="mb-4 space-y-3">
        {ticket.messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-xl p-3 text-sm ${
              m.isStaff
                ? 'ml-auto bg-emerald-500/10 border border-emerald-500/30'
                : 'bg-neutral-900 border border-neutral-800'
            }`}
          >
            <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
              {m.isStaff ? 'Support MISTERDOU' : 'Vous'} ·{' '}
              {new Date(m.createdAt).toLocaleString('fr-SN')}
            </p>
            <p className="whitespace-pre-wrap">{m.body}</p>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Réponse */}
      {!['RESOLVED', 'CLOSED'].includes(ticket.status) && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="Écrivez votre réponse…"
            className="mb-3 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={sending || !reply.trim()}
            className="rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
        </div>
      )}
    </main>
  );
}