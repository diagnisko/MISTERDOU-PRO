'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ProductCard {
  id: string;
  slug: string;
  title: string;
  price: number;
  platform: string | null;
  level: number | null;
  coins: number | null;
  hasLegends: boolean;
  images: { url: string }[];
  seller: { shopName: string; rating: number | null } | null;
}

const fmtPrice = (n: number) =>
  new Intl.NumberFormat('fr-SN').format(n) + ' FCFA';

export default function CatalogPage() {
  const [items, setItems] = useState<ProductCard[] | null>(null);
  const [total, setTotal] = useState(0);
  const [platform, setPlatform] = useState('');
  const [sort, setSort] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (sort) params.set('sort', sort);
    const url = `${API}/api/v1/catalog?${params}`;
    setItems(null);
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error('Erreur de chargement');
        return r.json();
      })
      .then((d) => {
        setItems(d.items ?? []);
        setTotal(d.total ?? 0);
      })
      .catch((e) => setError((e as Error).message));
  }, [platform, sort]);

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-2 text-3xl font-bold">Catalogue</h1>
      <p className="mb-6 text-neutral-400">
        {items === null ? 'Chargement…' : `${total} comptes disponibles`}
      </p>

      {/* Filtres */}
      <div className="mb-8 flex flex-wrap gap-3">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2"
        >
          <option value="">Toutes plateformes</option>
          <option value="Android">Android</option>
          <option value="iOS">iOS</option>
          <option value="Both">Android + iOS</option>
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2"
        >
          <option value="">Plus récents</option>
          <option value="price-asc">Prix croissant</option>
          <option value="price-desc">Prix décroissant</option>
        </select>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Grille + skeleton shimmer pendant chargement */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items === null
          ? Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-neutral-800 bg-neutral-900"
              >
                <div className="h-44 rounded-t-xl bg-neutral-800" />
                <div className="space-y-3 p-4">
                  <div className="h-4 w-3/4 rounded bg-neutral-800" />
                  <div className="h-3 w-1/2 rounded bg-neutral-800" />
                  <div className="h-6 w-1/3 rounded bg-neutral-800" />
                </div>
              </div>
            ))
          : items.map((p) => (
              <a
                key={p.id}
                href={`/catalog/${p.slug}`}
                className="group rounded-xl border border-neutral-800 bg-neutral-900 transition hover:border-emerald-400/60"
              >
                <div className="h-44 overflow-hidden rounded-t-xl bg-neutral-800">
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.images[0].url}
                      alt={p.title}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-4xl">
                      ⚽
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <h3 className="font-semibold line-clamp-1">{p.title}</h3>
                  <p className="text-xs text-neutral-400">
                    {p.platform} · Niv. {p.level ?? '—'}
                    {p.coins ? ` · ${p.coins} pièces` : ''}
                    {p.hasLegends && ' · 🌟 Légendes'}
                  </p>
                  <p className="text-sm text-emerald-400">
                    {p.seller?.shopName ?? 'MISTERDOU'}
                  </p>
                  <p className="text-lg font-bold">{fmtPrice(p.price)}</p>
                </div>
              </a>
            ))}
      </div>
    </main>
  );
}