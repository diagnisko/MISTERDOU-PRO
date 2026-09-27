'use client';

import { useEffect, useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Notif {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/**
 * Cloche de notifications — compteur non-lues, dropdown, marquage lu.
 */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Rafraîchit le compteur toutes les 30 s (polling léger)
  useEffect(() => {
    async function poll() {
      const token = localStorage.getItem('md_token');
      if (!token) return;
      try {
        const res = await fetch(`${API}/api/v1/notifications/me?perPage=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        setUnread(data.unread ?? 0);
        setItems(data.items ?? []);
      } catch {
        // silencieux
      }
    }
    poll();
    const timer = setInterval(poll, 30_000);
    return () => clearInterval(timer);
  }, []);

  // Fermeture au clic extérieur
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  async function markAll() {
    const token = localStorage.getItem('md_token');
    await fetch(`${API}/api/v1/notifications/read-all`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
    });
    setUnread(0);
    setItems((its) => its.map((i) => ({ ...i, read: true })));
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 hover:bg-neutral-800"
        aria-label="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="flex items-center justify-between border-b border-neutral-800 p-3">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-emerald-400 hover:underline">
                Tout marquer lu
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-sm text-neutral-500">Aucune notification.</p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={`border-b border-neutral-800/50 p-3 text-sm ${
                    n.read ? 'opacity-60' : 'bg-emerald-500/5'
                  }`}
                >
                  <p className="font-medium">{n.title}</p>
                  <p className="mt-0.5 text-xs text-neutral-400">{n.body}</p>
                  <p className="mt-1 text-[10px] text-neutral-600">
                    {new Date(n.createdAt).toLocaleString('fr-SN')}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}