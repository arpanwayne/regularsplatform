"use client";

import { useCallback, useEffect, useState } from "react";
import { USE_OFFER_EVENT, type UseOfferDetail } from "@/components/offer-composer";

type Summary = { segment: string; count: number; share: number; avgSpend: number; avgVisits: number; medianDaysSinceVisit: number | null; engagedShare: number };
type Suggestion = { title: string; message: string; discountPercent: number | null; why: string; ai: boolean };
type Data = { total: number; summaries: Summary[]; suggestions: Record<string, Suggestion>; aiError: string | null };

const INFO: Record<string, { label: string; meaning: string; cls: string }> = {
  REGULAR: { label: "Regular", meaning: "Come often, came recently", cls: "border-green-200 bg-green-50" },
  HIGH_SPENDER: { label: "High-spending", meaning: "Top 20% by total spend", cls: "border-purple-200 bg-purple-50" },
  NEW: { label: "New", meaning: "First came recently", cls: "border-blue-200 bg-blue-50" },
  AT_RISK: { label: "At-risk", meaning: "No visit in 30–60 days", cls: "border-amber-200 bg-amber-50" },
  DORMANT: { label: "Dormant", meaning: "No visit in 60+ days", cls: "border-gray-200 bg-gray-50" },
};

/**
 * AI customer segments on the Offers page: how many customers are in each
 * group (re-scored from their visits and spend), and one targeted offer per
 * group that fills the offer form in one click.
 */
export function SegmentOfferIdeas({ currency }: { currency: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState<"load" | "ai" | null>("load");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (ai: boolean) => {
    setBusy(ai ? "ai" : "load"); setError(null);
    const res = await fetch("/api/offers/suggestions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ai }) }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res?.ok) { setError(d.error || "Couldn't load customer groups."); return; }
    setData(d);
    if (d.aiError) setError(d.aiError);
  }, []);

  useEffect(() => { load(false); }, [load]);

  const use = (segment: string, s: Suggestion) => {
    window.dispatchEvent(new CustomEvent<UseOfferDetail>(USE_OFFER_EVENT, { detail: { title: s.title, message: s.message, discountPercent: s.discountPercent, segment } }));
  };

  return (
    <section className="space-y-3 rounded-card border border-gray-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">Customer groups &amp; offer ideas</h2>
          <p className="text-xs text-gray-500">
            Every customer is sorted automatically from their visits, spending and how recently they came. Pick a group&apos;s idea to fill the offer form for just that group.
          </p>
        </div>
        <button type="button" onClick={() => load(true)} disabled={busy !== null || !data?.total}
          className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-60">
          {busy === "ai" ? "Analysing customers…" : "✨ Get AI offer ideas"}
        </button>
      </div>
      {error && <p className="text-xs text-amber-700">{error}</p>}
      {busy === "load" && !data && <p className="text-gray-500">Sorting customers…</p>}
      {data && data.total === 0 && <p className="text-gray-500">No customers yet. Groups appear once customers message you, scan your QR or are imported.</p>}
      {data && data.total > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.summaries.map((s) => {
            const info = INFO[s.segment];
            const idea = data.suggestions[s.segment];
            return (
              <div key={s.segment} className={`flex flex-col gap-2 rounded-card border p-3 ${info.cls}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">{info.label} customers</p>
                  <p className="text-lg font-semibold">{s.count}</p>
                </div>
                <p className="text-xs text-gray-600">{info.meaning}{s.count ? ` · ${Math.round(s.share * 100)}% of customers` : ""}</p>
                {s.count > 0 && (
                  <p className="text-xs text-gray-600">
                    Avg spend {currency}{s.avgSpend.toLocaleString()} · {s.avgVisits} visits · last came ~{s.medianDaysSinceVisit} days ago · {Math.round(s.engagedShare * 100)}% messaged this month
                  </p>
                )}
                {s.count > 0 && idea && (
                  <div className="mt-auto space-y-1 rounded-input bg-white/80 p-2">
                    <p className="text-xs font-medium">{idea.ai ? "✨ AI idea" : "Idea"}: {idea.title}{idea.discountPercent ? ` (${idea.discountPercent}% off)` : ""}</p>
                    <p className="text-xs text-gray-700">{idea.message}</p>
                    <p className="text-xs italic text-gray-500">{idea.why}</p>
                    <button type="button" onClick={() => use(s.segment, idea)} className="text-xs font-medium text-brand-800 underline">Use this offer →</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
