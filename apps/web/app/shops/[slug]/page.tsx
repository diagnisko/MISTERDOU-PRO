'use client';

import { useEffect, useState } from 'react';
import { use } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ShopData {
  shopName: string;
  slug: string;
  description: string | null;
  rating: string | null;
  salesCount: number;
  products: {
    id: string;
    title: string;
    slug: string;
    price: string;
    platform: string | null;
    images: { url: string }[];
  }[];
}

const fmt = (n: string | number) =>
  new Intl.NumberFormat('fr-SN').format(Number(n)) + ' FCFA';

export default function ShopPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [shop, setShop] = useState<ShopData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/shops/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error('Boutique introuvable');
        return r.json();
      })
      .then(setShop)
      .catch((e) => setError((e as Error).message));
  }, [slug]);

  if (error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!shop) {
    return (
      <main className="mx-auto max-w-5xl animate-pulse p-6">
        <div className="mb-6 h-10 w-1/3 rounded bg-neutral-800" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-64 rounded-xl bg-neutral-800" />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-8">
        <h1 className="mb-1 text-3xl font-bold">{shop.shopName}</h1>
        <p className="text-sm text-neutral-400">
          ⭐ {shop.rating ?? '—'} · {shop.salesCount} ventes
        </p>
        {shop.description && (
          <p className="mt-3 max-w-2xl text-neutral-300">{shop.description}</p>
        )}
      </header>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {shop.products.length === 0 && (
          <p className="text-neutral-500">
            Cette boutique n&apos;a pas encore d&apos;offres publiées.
          </p>
        )}
        {shop.products.map((p) => (
          <a
            key={p.id}
            href={`/catalog/${p.slug}`}
            className="group rounded-xl border border-neutral-800 bg-neutral-900 transition hover:border-emerald-400/60"
          >
            <div className="h-40 overflow-hidden rounded-t-xl bg-neutral-800">
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.images[0].url}
                  alt={p.title}
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-4xl">⚽</div>
              )}
            </div>
            <div className="p-4">
              <h3 className="mb-1 line-clamp-1 font-semibold">{p.title}</h3>
              <p className="mb-2 text-xs text-neutral-400">{p.platform}</p>
              <p className="font-bold">{fmt(p.price)}</p>
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}