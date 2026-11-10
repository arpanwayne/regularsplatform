"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUNDLE_PLANS, BUNDLE_PLAN_IDS } from "@/lib/hub/plans";
import type { FrontDeskPlan } from "@/lib/types";

export function BundleAdminRow({ id, plan: initial }: { id: string; plan: FrontDeskPlan }) {
  const router = useRouter();
  const [plan, setPlan] = useState<FrontDeskPlan>(initial);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run(body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/businesses/${id}/bundle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    const tools = (d.tools ?? []) as { tool: string; ok: boolean; error?: string; skipped?: string }[];
    setMsg(res.ok ? (tools.length ? tools.map((t) => `${t.tool}: ${t.ok ? "ok" : t.skipped ?? t.error}`).join(" · ") : "Done.") : JSON.stringify(d.error));
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1">
        <select value={plan} onChange={(e) => setPlan(e.target.value as FrontDeskPlan)} className="rounded-md border border-gray-300 px-2 py-1 text-xs">
          {BUNDLE_PLAN_IDS.map((p) => <option key={p} value={p}>{BUNDLE_PLANS[p].name}</option>)}
        </select>
        <input type="number" min={1} max={366} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-16 rounded-md border border-gray-300 px-2 py-1 text-xs" aria-label="Days" />
        <button disabled={busy} onClick={() => run({ action: "activate", plan, days })} className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Activate</button>
      </div>
      <div className="flex gap-1">
        <button disabled={busy} onClick={() => run({ action: "reprovision" })} className="rounded-md border border-gray-300 px-2 py-1 text-xs">Re-run set-up</button>
        <button disabled={busy} onClick={() => run({ action: "rotate-keys" })} className="rounded-md border border-gray-300 px-2 py-1 text-xs">New keys</button>
      </div>
      {msg && <p className="max-w-xs text-right text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
