'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PendingKyc {
  id: string;
  status: string;
  docType: string | null;
  submittedAt: string;
  user: { email: string; firstName: string | null; lastName: string | null };
}

export default function AdminKycPage() {
  const [items, setItems] = useState<PendingKyc[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function api(path: string, method: string, body?: unknown) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(`${API}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.json()).message ?? 'Erreur');
    return res.json();
  }

  async function load() {
    try {
      const data = await api('/kyc/admin/pending', 'GET');
      setItems(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function review(id: string, decision: 'APPROVED' | 'REJECTED') {
    const comment =
      decision === 'REJECTED'
        ? window.prompt('Motif du rejet :') ?? 'Non conforme'
        : undefined;
    try {
      await api(`/kyc/admin/${id}/review`, 'POST', { decision, comment });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function openDoc(id: string, docKind: string) {
    try {
      const { url } = await api(`/kyc/admin/${id}/document/${docKind}`, 'GET');
      window.open(url, '_blank', 'noopener,noreferrer'); // URL signée 60 s
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-8 text-3xl font-bold">Revue KYC — dossiers en attente</h1>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-neutral-400">Aucun dossier en attente.</p>
      ) : (
        <div className="space-y-4">
          {items.map((k) => (
            <div
              key={k.id}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <div className="mb-3 flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold">
                    {k.user.firstName} {k.user.lastName}
                  </p>
                  <p className="text-sm text-neutral-400">{k.user.email}</p>
                </div>
                <span className="rounded-full border border-amber-500/40 px-3 py-1 text-xs text-amber-400">
                  {k.docType}
                </span>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {['doc-front', 'doc-back', 'selfie'].map((d) => (
                  <button
                    key={d}
                    onClick={() => openDoc(k.id, d)}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-sm transition hover:border-emerald-400"
                  >
                    Voir {d}
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => review(k.id, 'APPROVED')}
                  className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-neutral-950 transition hover:bg-emerald-400"
                >
                  Approuver
                </button>
                <button
                  onClick={() => review(k.id, 'REJECTED')}
                  className="rounded-lg border border-red-500/50 px-4 py-2 font-semibold text-red-400 transition hover:bg-red-500/10"
                >
                  Rejeter
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}