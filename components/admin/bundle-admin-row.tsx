"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BUNDLE_PLANS, BUNDLE_PLAN_IDS } from "@/lib/hub/plans";
import { periodDays } from "@/lib/hub/catalog-rules";

/** plan is a built-in plan id (ANSWER…) or "custom:<bundleId>" for a Products & Bundles bundle. */
export function BundleAdminRow({ id, plan: initial, currency = "CAD", customBundles = [] }: {
  id: string; plan: string; currency?: string; customBundles?: { id: string; name: string; interval: string }[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<string>(initial);
  const custom = plan.startsWith("custom:") ? customBundles.find((b) => b.id === plan.slice(7)) : undefined;
  const [days, setDays] = useState(custom ? periodDays(custom.interval) : 30);
  const [amount, setAmount] = useState("");
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
        <select value={plan} onChange={(e) => {
          setPlan(e.target.value);
          const b = e.target.value.startsWith("custom:") ? customBundles.find((x) => x.id === e.target.value.slice(7)) : undefined;
          setDays(b ? periodDays(b.interval) : 30);
        }} className="rounded-input border border-control px-2 py-1 text-xs">
          {customBundles.length > 0 && <optgroup label="Our bundles">{customBundles.map((b) => <option key={b.id} value={`custom:${b.id}`}>{b.name}</option>)}</optgroup>}
          <optgroup label="Built-in plans">{BUNDLE_PLAN_IDS.map((p) => <option key={p} value={p}>{BUNDLE_PLANS[p].name}</option>)}</optgroup>
        </select>
        <input type="number" min={1} max={366} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-16 rounded-input border border-control px-2 py-1 text-xs" aria-label="Days" title="Days" />
        <input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Paid ${currency}`} className="w-24 rounded-input border border-control px-2 py-1 text-xs" aria-label={`Amount paid offline (${currency}), blank for a free pilot`} title={`Amount paid offline (${currency}). Blank = free pilot.`} />
        <button disabled={busy} onClick={() => run({ ...(plan.startsWith("custom:") ? { action: "activate-custom", bundleId: plan.slice(7) } : { action: "activate", plan }), days, ...(Number(amount) > 0 ? { amount: Number(amount) } : {}) })} className="rounded-full bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">Activate</button>
      </div>
      <div className="flex gap-1">
        <button disabled={busy} onClick={() => run({ action: "reprovision" })} className="rounded-full border border-control px-2 py-1 text-xs">Re-run set-up</button>
        <button disabled={busy} onClick={() => run({ action: "rotate-keys" })} className="rounded-full border border-control px-2 py-1 text-xs">New keys</button>
      </div>
      {msg && <p className="max-w-xs text-right text-xs text-gray-600">{msg}</p>}
    </div>
  );
}
