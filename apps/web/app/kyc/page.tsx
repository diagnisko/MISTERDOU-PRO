'use client';

import { useState } from 'react';

type DocKind = 'doc-front' | 'doc-back' | 'selfie';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function KycPage() {
  const [docType, setDocType] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [uploads, setUploads] = useState<Record<DocKind, string | null>>({
    'doc-front': null,
    'doc-back': null,
    selfie: null,
  });

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

  async function uploadDoc(kind: DocKind, file: File) {
    setError(null);
    try {
      // 1) URL signée PUT depuis l'API
      const { objectKey, uploadUrl } = await api(
        '/kyc/documents/presign',
        'POST',
        { docKind: kind, contentType: file.type },
      );
      // 2) Upload direct vers R2 (privé)
      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('Échec du téléversement.');
      // 3) Confirmation à l'API
      await api('/kyc/documents/confirm', 'POST', {
        docKind: kind,
        objectKey,
      });
      setUploads((u) => ({ ...u, [kind]: objectKey }));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit() {
    setError(null);
    try {
      const res = await api('/kyc/submit', 'POST', { docType, docNumber });
      setStatus(res.status);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (status === 'SUBMITTED') {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="mb-4 text-3xl font-bold text-emerald-400">
            Dossier envoyé ✅
          </h1>
          <p className="text-neutral-400">
            Votre identité est en cours de vérification. Vous recevrez une
            notification dès la décision.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-2 text-3xl font-bold">Vérification d&apos;identité</h1>
      <p className="mb-8 text-neutral-400">
        Documents stockés de façon privée et chiffrée — jamais accessibles par
        URL publique.
      </p>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {(
          [
            { kind: 'doc-front', label: 'Pièce d\'identité — recto' },
            { kind: 'doc-back', label: 'Pièce d\'identité — verso' },
            { kind: 'selfie', label: 'Selfie avec la pièce' },
          ] as { kind: DocKind; label: string }[]
        ).map(({ kind, label }) => (
          <div key={kind}>
            <label className="mb-2 block font-medium">{label}</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) =>
                e.target.files?.[0] && uploadDoc(kind, e.target.files[0])
              }
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3 text-sm file:mr-4 file:rounded file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:font-semibold file:text-neutral-950"
            />
            {uploads[kind] && (
              <p className="mt-1 text-xs text-emerald-400">✅ Téléversé</p>
            )}
          </div>
        ))}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-2 block font-medium">Type de document</label>
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3"
            >
              <option value="">— Choisir —</option>
              <option value="CNI">CNI</option>
              <option value="PASSPORT">Passeport</option>
              <option value="PERMIS_CONDUIRE">Permis de conduire</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block font-medium">Numéro du document</label>
            <input
              value={docNumber}
              onChange={(e) => setDocNumber(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 p-3"
              placeholder="Ex : 123456789"
            />
          </div>
        </div>

        <button
          onClick={submit}
          disabled={!docType || !docNumber || Object.values(uploads).some((k) => !k)}
          className="w-full rounded-lg bg-emerald-500 py-3 font-semibold text-neutral-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Soumettre mon dossier
        </button>
      </div>
    </main>
  );
}