'use client';

import { use, useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface ProductDetail {
  id: string;
  title: string;
  description: string | null;
  price: number;
  platform: string | null;
  level: number | null;
  playersCount: number | null;
  coins: number | null;
  hasLegends: boolean;
  specialFeatures: string | null;
  images: { url: string; mediaType: string; isCover: boolean }[];
  seller: { shopName: string; slug: string; rating: number | null; salesCount: number } | null;
}

const fmtPrice = (n: number) =>
  new Intl.NumberFormat('fr-SN').format(n) + ' FCFA';

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/v1/catalog/${slug}`)
      .then((r) => {
        if (!r.ok) throw new Error('Offre introuvable');
        return r.json();
      })
      .then(setProduct)
      .catch((e) => setError((e as Error).message));
  }, [slug]);

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <p className="text-red-400">{error}</p>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-4xl animate-pulse p-6">
        <div className="mb-6 h-72 rounded-xl bg-neutral-800" />
        <div className="mb-4 h-8 w-2/3 rounded bg-neutral-800" />
        <div className="h-6 w-1/3 rounded bg-neutral-800" />
      </main>
    );
  }

  const cover = product.images.find((i) => i.isCover) ?? product.images[0];
  const others = product.images.filter((i) => i !== cover);

  return (
    <main className="mx-auto max-w-4xl p-6">
      {cover && (
        <div className="mb-6 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900">
          {cover.mediaType === 'VIDEO' ? (
            <video src={cover.url} controls className="h-96 w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover.url} alt={product.title} className="h-96 w-full object-cover" />
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="mb-6 flex gap-3 overflow-x-auto">
          {others.map((img, i) =>
            img.mediaType === 'VIDEO' ? (
              <video key={i} src={img.url} controls className="h-24 rounded-lg" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={img.url} alt="" className="h-24 rounded-lg" />
            ),
          )}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex-1">
          <h1 className="mb-2 text-3xl font-bold">{product.title}</h1>
          <p className="mb-4 text-neutral-400">
            Vendu par{' '}
            <span className="text-emerald-400">
              {product.seller?.shopName ?? 'MISTERDOU'}
            </span>
            {product.seller?.rating
              ? ` · ⭐ ${product.seller.rating}/5 (${product.seller.salesCount} ventes)`
              : ''}
          </p>
          {product.description && (
            <p className="mb-6 whitespace-pre-line text-neutral-300">
              {product.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              ['Plateforme', product.platform],
              ['Niveau', product.level],
              ['Joueurs', product.playersCount],
              ['Pièces', product.coins?.toLocaleString('fr-SN')],
              ['Légendes', product.hasLegends ? 'Oui 🌟' : null],
            ]
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => (
                <div
                  key={String(k)}
                  className="rounded-lg border border-neutral-800 bg-neutral-900 p-3"
                >
                  <p className="text-xs text-neutral-500">{k}</p>
                  <p className="font-semibold">{String(v)}</p>
                </div>
              ))}
          </div>

          {product.specialFeatures && (
            <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
              ✨ {product.specialFeatures}
            </p>
          )}
        </div>

        <aside className="w-full rounded-xl border border-neutral-800 bg-neutral-900 p-6 sm:w-64">
          <p className="mb-1 text-3xl font-extrabold text-emerald-400">
            {fmtPrice(product.price)}
          </p>
          <p className="mb-4 text-xs text-neutral-500">
            Paiement en ligne ou en plusieurs fois
          </p>
          <button className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-neutral-950 transition hover:bg-emerald-400">
            Acheter maintenant
          </button>
          <p className="mt-3 text-center text-[11px] text-neutral-500">
            Identifiants délivrés après paiement vérifié
          </p>
        </aside>
      </div>
    </main>
  );
}