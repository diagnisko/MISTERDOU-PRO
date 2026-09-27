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
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState('');
  const [filterEntity, setFilterEntity] = useState('');

  async function load() {
    const token = localStorage.getItem('md_token');
    const params = new URLSearchParams();
    if (filterAction) params.set('action', filterAction);
    if (filterEntity) params.set('entity', filterEntity);
    const res = await fetch(`${API}/api/v1/admin/audit-logs?${params}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (!res.ok) {
      setError('Accès refusé — rôle ADMIN requis');
      return;
    }
    const data = await res.json();
    setLogs(data.items);
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-6 text-3xl font-bold">Journaux d&apos;audit</h1>

      {/* Filtres */}
      <div className="mb-6 flex flex-wrap gap-3">
        <input
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          placeholder="Filtrer par action (ex : SELLER, WITHDRAWAL)"
          className="w-64 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        />
        <input
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value)}
          placeholder="Entité (Seller, Withdrawal, Product…)"
          className="w-56 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        />
        <button
          onClick={load}
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-emerald-400"
        >
          Filtrer
        </button>
      </div>

      {!logs ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 rounded bg-neutral-800" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <p className="text-neutral-500">Aucun log correspondant.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900 text-left text-neutral-500">
                <th className="p-3">Date</th>
                <th className="p-3">Acteur</th>
                <th className="p-3">Action</th>
                <th className="p-3">Entité</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-neutral-800/50">
                  <td className="p-3 text-neutral-400">
                    {new Date(l.createdAt).toLocaleString('fr-SN')}
                  </td>
                  <td className="p-3">{l.actor?.email ?? 'système'}</td>
                  <td className="p-3">
                    <span className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs text-emerald-400">
                      {l.action}
                    </span>
                  </td>
                  <td className="p-3 text-neutral-400">{l.entity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}