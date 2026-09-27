'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface UserRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  emailVerified: boolean;
  createdAt: string;
  kyc: { status: string } | null;
  seller: { shopName: string; status: string } | null;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');

  async function load() {
    const token = localStorage.getItem('md_token');
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    const res = await fetch(`${API}/api/v1/admin/users?${params}`, {
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    if (!res.ok) {
      setError('Accès refusé');
      return;
    }
    const data = await res.json();
    setUsers(data.items);
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
      <h1 className="mb-6 text-3xl font-bold">Utilisateurs</h1>

      {/* Recherche */}
      <div className="mb-6 flex flex-wrap gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher (e-mail, nom…)"
          className="w-72 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm focus:border-emerald-400 focus:outline-none"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm"
        >
          <option value="">Tous les rôles</option>
          <option value="CLIENT">Clients</option>
          <option value="SELLER">Vendeurs</option>
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admins</option>
        </select>
        <button
          onClick={load}
          className="rounded-lg border border-neutral-700 px-4 py-2 text-sm hover:border-emerald-400"
        >
          Rechercher
        </button>
      </div>

      {!users ? (
        <div className="animate-pulse space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 rounded bg-neutral-800" />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 bg-neutral-900 text-left text-neutral-500">
                <th className="p-3">E-mail</th>
                <th className="p-3">Rôle</th>
                <th className="p-3">Statut</th>
                <th className="p-3">KYC</th>
                <th className="p-3">Boutique</th>
                <th className="p-3">Inscrit le</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-neutral-800/50">
                  <td className="p-3 font-medium">{u.email}</td>
                  <td className="p-3">{u.role}</td>
                  <td className="p-3">{u.status}</td>
                  <td className="p-3">{u.kyc?.status ?? '—'}</td>
                  <td className="p-3">
                    {u.seller ? `${u.seller.shopName} (${u.seller.status})` : '—'}
                  </td>
                  <td className="p-3 text-neutral-400">
                    {new Date(u.createdAt).toLocaleDateString('fr-SN')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}