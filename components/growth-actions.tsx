"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function PlanNowButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/growth/plan", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? `Planned ${d.planned} new action${d.planned === 1 ? "" : "s"}${d.executed ? `, ${d.executed} done automatically` : ""}.` : d.error || "Couldn't plan.");
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3">
      {msg && <span className="text-sm text-gray-600">{msg}</span>}
      <button onClick={run} disabled={busy || disabled} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
        {busy ? "Planning…" : "Plan now"}
      </button>
    </div>
  );
}

export function GrowthActionCard(p: {
  id: string; status: string; title: string; reason: string; kind: string; channel: string | null;
  text: string | null; quote: string | null; value: string | null; autonomy: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(p.text ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function decide(decision: "approve" | "skip") {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/growth/actions/${p.id}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision, ...(decision === "approve" && editing && text !== p.text ? { text } : {}) }),
    });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(d.error || "Couldn't save."); return; }
    setMsg(decision === "skip" ? "Skipped." : d.status === "DONE" ? "Done." : d.status === "DEFERRED" ? `Approved — runs in contact hours.` : `Approved (${String(d.status).toLowerCase()}).`);
    router.refresh();
  }

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{p.kind}</span>
        {p.channel && <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">{p.channel === "CALL" ? "AI call" : "Text"}</span>}
        {p.value && <span className="text-gray-500">worth about {p.value}</span>}
        {p.status === "APPROVED" && <span className="rounded bg-green-50 px-2 py-0.5 text-green-700">approved, waiting for contact hours</span>}
      </div>
      <div>
        <h3 className="font-medium">{p.title}</h3>
        <p className="text-sm text-gray-600">{p.reason}</p>
      </div>
      {p.quote && <blockquote className="border-l-2 border-gray-200 pl-3 text-sm italic text-gray-600">&ldquo;{p.quote}&rdquo;</blockquote>}
      {p.text != null && (
        editing ? (
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={600}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" aria-label="Message text" />
        ) : (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-800">{text}</p>
        )
      )}
      {p.status === "PROPOSED" && (
        <div className="mt-auto flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={() => decide("approve")} className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
            {busy ? "Working…" : p.channel === "CALL" ? "Approve call" : "Approve"}
          </button>
          {p.text != null && !editing && <button onClick={() => setEditing(true)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Edit text</button>}
          <button disabled={busy} onClick={() => decide("skip")} className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Skip</button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>
      )}
    </article>
  );
}
