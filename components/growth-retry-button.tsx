"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Retry a failed Growth AI action (retest 27 Nov 2026, NEW 4). */
export function GrowthRetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function retry() {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/growth/actions/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "retry" }) });
    const data = (await res.json().catch(() => ({}))) as { status?: string; error?: unknown };
    setBusy(false);
    if (!res.ok) setMsg(typeof data.error === "string" ? data.error : "Couldn't retry. Please try again.");
    else if (data.status === "DEFERRED") setMsg("Queued: it goes out in contact hours.");
    router.refresh();
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" onClick={retry} disabled={busy} className="rounded-full border border-control px-3 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50">
        {busy ? "Retrying…" : "Retry"}
      </button>
      {msg && <span className="text-xs text-gray-600">{msg}</span>}
    </span>
  );
}
