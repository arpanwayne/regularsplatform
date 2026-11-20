"use client";

import { useCallback, useEffect, useState } from "react";

type Row = {
  key: string; lang: string; name: string; language: string; category: string; body: string;
  metaStatus: string | null; metaCategory: string | null; rejectedReason: string | null;
};
type Result = { name: string; language: string; result: string; status?: string; error?: string };

const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  PENDING: "bg-amber-100 text-amber-800",
  IN_APPEAL: "bg-amber-100 text-amber-800",
  REJECTED: "bg-red-100 text-red-700",
  PAUSED: "bg-red-100 text-red-700",
  DISABLED: "bg-red-100 text-red-700",
};

export function WhatsAppTemplatesPanel({ accounts }: { accounts: { id: string; label: string }[] }) {
  const [locationId, setLocationId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; text: string }>>({});
  // Marketing templates sent per test number this session (Meta lets one person get ~1 a day).
  const [marketingSent, setMarketingSent] = useState<Record<string, number>>({});

  async function sendTest(r: Row) {
    const id = r.name + r.language;
    const num = testTo.replace(/[^\d+]/g, "");
    if ((r.metaCategory ?? r.category) === "MARKETING" && (marketingSent[num] ?? 0) >= 1
      && !window.confirm(`${testTo} already got a marketing test today. WhatsApp will probably hold this one back (Meta 131049). Send anyway?`)) return;
    setTesting(id);
    const res = await fetch("/api/admin/whatsapp-templates/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: r.key, lang: r.lang, to: testTo, ...(locationId ? { locationId } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(null);
    if (res.ok && (r.metaCategory ?? r.category) === "MARKETING") setMarketingSent((m) => ({ ...m, [num]: (m[num] ?? 0) + 1 }));
    setTestResult((t) => ({
      ...t,
      [id]: res.ok
        ? { ok: true, text: "Sent. Check the phone. If it doesn't arrive in a minute, Admin → Logs shows why." }
        : { ok: false, text: data.error ?? "Couldn't send" },
    }));
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams();
    if (locationId) q.set("locationId", locationId);
    if (wabaId) q.set("wabaId", wabaId);
    const res = await fetch(`/api/admin/whatsapp-templates?${q}`);
    const data = await res.json().catch(() => ({}));
    setRows(data.templates ?? []);
    setError(data.error ?? null);
    setLoading(false);
  }, [locationId, wabaId]);

  useEffect(() => { if (!locationId || wabaId) load(); }, [load, locationId, wabaId]);

  async function submit() {
    setSubmitting(true);
    setResults(null);
    setError(null);
    const res = await fetch("/api/admin/whatsapp-templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...(locationId ? { locationId } : {}), ...(wabaId ? { wabaId } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);
    if (!res.ok) { setError(data.error ?? "Submit failed"); return; }
    setResults(data.results ?? []);
    load();
  }

  const approved = rows.filter((r) => r.metaStatus === "APPROVED").length;
  const missing = rows.filter((r) => !r.metaStatus).length;
  const failed = results?.filter((r) => r.result === "FAILED") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-card border border-gray-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">WhatsApp account</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="rounded-input border border-control px-3 py-2 text-sm">
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">WhatsApp Business Account ID {locationId ? "(required)" : "(optional — env default)"}</span>
          <input value={wabaId} onChange={(e) => setWabaId(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 102290129340398" className="w-64 rounded-input border border-control px-3 py-2 text-sm" />
        </label>
        <button onClick={load} disabled={loading} className="rounded-full border border-control px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
          {loading ? "Checking…" : "Refresh status"}
        </button>
        <button onClick={submit} disabled={submitting || (!!locationId && !wabaId)} className="rounded-full bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50">
          {submitting ? "Submitting…" : missing ? `Submit ${missing} missing to Meta` : "Submit missing to Meta"}
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-card border border-gray-200 bg-white p-4">
        <label className="text-sm">
          <span className="mb-1 block text-gray-600">Test number (with country code)</span>
          <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+91 98765 43210" inputMode="tel" className="w-56 rounded-input border border-control px-3 py-2 text-sm" />
        </label>
        <p className="max-w-xl text-xs text-gray-500">
          &ldquo;Send test&rdquo; sends that template with its example values to this number. Utility templates can all go to one
          number. Marketing templates: one per number per day, or WhatsApp holds them back (Meta 131049), so use a different
          team number for each.
        </p>
      </div>

      {error && <p className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {results && (
        <p className="rounded-card bg-gray-50 px-3 py-2 text-sm text-gray-700">
          {results.filter((r) => r.result === "SUBMITTED").length} submitted, {results.filter((r) => r.result === "ALREADY_THERE").length} already there, {failed.length} failed.
          {failed.map((f) => <span key={f.name + f.language} className="block text-red-700">{f.name} ({f.language}): {f.error}</span>)}
        </p>
      )}
      <p className="text-sm text-gray-600">{approved} of {rows.length} approved. Meta usually reviews within minutes, sometimes up to 24 hours.</p>

      <div className="overflow-hidden rounded-card border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr><th className="px-3 py-2">Template</th><th className="px-3 py-2">Lang</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Text</th><th className="px-3 py-2">Meta</th><th className="px-3 py-2">Test</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.name + r.language} className="align-top">
                <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
                <td className="px-3 py-2">{r.lang}</td>
                <td className="px-3 py-2 text-xs">{r.metaCategory ?? r.category}{r.metaCategory && r.metaCategory !== r.category && <span className="block text-amber-700">(we asked {r.category})</span>}</td>
                <td className="max-w-xl px-3 py-2 text-xs text-gray-700">{r.body}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.metaStatus ? STATUS_STYLE[r.metaStatus] ?? "bg-gray-100 text-gray-700" : "bg-gray-100 text-gray-500"}`}>
                    {r.metaStatus ?? "Not submitted"}
                  </span>
                  {r.rejectedReason && <span className="mt-1 block text-xs text-red-700">{r.rejectedReason}</span>}
                </td>
                <td className="px-3 py-2">
                  <button
                    onClick={() => sendTest(r)}
                    disabled={!testTo.trim() || testing === r.name + r.language || r.metaStatus !== "APPROVED"}
                    title={r.metaStatus !== "APPROVED" ? "Only approved templates can be sent" : !testTo.trim() ? "Enter a test number above" : undefined}
                    className="whitespace-nowrap rounded-full border border-control px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {testing === r.name + r.language ? "Sending…" : "Send test"}
                  </button>
                  {testResult[r.name + r.language] && (
                    <span className={`mt-1 block max-w-[14rem] text-xs ${testResult[r.name + r.language].ok ? "text-green-700" : "text-red-700"}`}>
                      {testResult[r.name + r.language].text}
                    </span>
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
