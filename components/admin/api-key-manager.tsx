"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  business: { id: string; name: string };
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");

export function ApiKeyManager({ keys, businesses }: { keys: ApiKeyRow[]; businesses: { id: string; name: string }[] }) {
  const router = useRouter();
  const [businessId, setBusinessId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ plaintext: string; name: string } | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ businessId, name }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(typeof body.error === "string" ? body.error : "Could not create key");
      return;
    }
    setIssued({ plaintext: body.key.plaintext, name: body.key.name });
    setName("");
    router.refresh();
  }

  async function revoke(k: ApiKeyRow) {
    if (!confirm(`Revoke "${k.name}"? Anything using it stops working immediately.`)) return;
    await fetch(`/api/admin/api-keys/${k.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={create} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold">Issue a key</h2>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <select required value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Business…</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='Used by, e.g. "Sehat Saathi — City Care"'
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button disabled={busy} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create key"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>

      {issued && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-900">Copy this key now — it will not be shown again.</p>
          <code className="block break-all rounded bg-white px-3 py-2 text-sm">{issued.plaintext}</code>
          <div className="flex gap-3 text-sm">
            <button onClick={() => navigator.clipboard.writeText(issued.plaintext)} className="font-medium text-amber-900 underline">
              Copy
            </button>
            <button onClick={() => setIssued(null)} className="text-amber-900">
              Done
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Business</th>
              <th className="px-4 py-2">Key</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Last used</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {keys.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No API keys yet.
                </td>
              </tr>
            )}
            {keys.map((k) => (
              <tr key={k.id} className={k.revokedAt ? "text-gray-400" : undefined}>
                <td className="px-4 py-2 font-medium">{k.name}</td>
                <td className="px-4 py-2">{k.business.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{k.keyPrefix}…</td>
                <td className="px-4 py-2">{fmt(k.createdAt)}</td>
                <td className="px-4 py-2">{fmt(k.lastUsedAt)}</td>
                <td className="px-4 py-2 text-right">
                  {k.revokedAt ? (
                    <span className="text-xs">Revoked {fmt(k.revokedAt)}</span>
                  ) : (
                    <button onClick={() => revoke(k)} className="text-sm font-medium text-red-600 hover:text-red-700">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
