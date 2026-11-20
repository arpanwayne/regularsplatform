"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Limits = { approvalMaxDiscount: number; approvalMaxAudience: number; approvalAutoFreebie: boolean };

/** Owner only: what a manager's offer may do without asking. */
export function ApprovalLimitsForm({ limits, sector }: { limits: Limits; sector: string }) {
  const router = useRouter();
  const [v, setV] = useState(limits);
  const [status, setStatus] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving…");
    const res = await fetch("/api/offers/limits", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
    const d = await res.json().catch(() => ({}));
    setStatus(res.ok ? "Saved." : d.error || "Couldn't save.");
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-card border border-gray-200 bg-white p-4 text-sm">
      <h2 className="font-medium">Your approval limits</h2>
      <p className="text-gray-600">A manager&apos;s offer inside these goes out without asking you. Anything bigger comes to your WhatsApp.</p>
      <label className="flex items-center justify-between gap-2">Up to discount (%)
        <input type="number" min={0} max={100} className="w-24 rounded-input border border-control px-2 py-1" value={v.approvalMaxDiscount} onChange={(e) => setV({ ...v, approvalMaxDiscount: Number(e.target.value) })} />
      </label>
      <label className="flex items-center justify-between gap-2">Up to customers per offer
        <input type="number" min={0} max={100000} className="w-24 rounded-input border border-control px-2 py-1" value={v.approvalMaxAudience} onChange={(e) => setV({ ...v, approvalMaxAudience: Number(e.target.value) })} />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={v.approvalAutoFreebie} onChange={(e) => setV({ ...v, approvalAutoFreebie: e.target.checked })} /> Free items / bonus points without asking</label>
      {sector === "CLINIC" && <p className="text-xs text-amber-700">Clinics: every manager offer comes to you, whatever the limits.</p>}
      <p className="text-xs text-gray-500">Set customers to 0 to approve every manager offer yourself.</p>
      <div className="flex items-center gap-3">
        <button className="rounded-full bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-800">Save</button>
        {status && <span className="text-gray-500">{status}</span>}
      </div>
    </form>
  );
}
