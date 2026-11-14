"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { BUNDLE_PLANS, BUNDLE_PLAN_IDS, formatPrice, currencyFor } from "@/lib/hub/plans";
import type { FrontDeskPlan } from "@/lib/types";
import { BUNDLE_NAME } from "@/lib/brand";

const SECTOR_OPTIONS: [string, string][] = [
  ["HOME_SERVICES", "Home services (HVAC, plumbing, electrical…)"], ["CLINIC", "Clinic"], ["SALON", "Salon / spa"],
  ["RESTAURANT", "Restaurant"], ["GYM", "Gym / studio"], ["RETAIL", "Retail"], ["OTHER", "Something else"],
];

/** One signup for the whole bundle: plan, business, owner — then one payment. */
export function BundleSignupForm({ initialPlan, initialCountry }: { initialPlan: FrontDeskPlan; initialCountry: "CA" | "IN" }) {
  const router = useRouter();
  const [plan, setPlan] = useState<FrontDeskPlan>(initialPlan);
  const [country, setCountry] = useState<"CA" | "IN">(initialCountry);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const currency = currencyFor(country);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"), email: f.get("email"), password: f.get("password"), businessName: f.get("businessName"),
        sector: f.get("sector"), phone: f.get("phone"), country, bundlePlan: plan,
      }),
    });
    const d = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(typeof d?.error === "string" ? d.error : "Please check the form and try again.");
      return;
    }
    router.push(d.next ?? "/dashboard/billing");
    router.refresh();
  }

  const input = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className="w-full max-w-3xl space-y-6">
      <div className="flex justify-end gap-1 text-sm">
        {(["CA", "IN"] as const).map((c) => (
          <button type="button" key={c} onClick={() => setCountry(c)}
            className={clsx("rounded-md px-3 py-1", country === c ? "bg-brand-100 font-medium text-brand-700" : "text-gray-600 hover:bg-gray-100")}>
            {c === "CA" ? "Canada · CAD" : "India · INR"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {BUNDLE_PLAN_IDS.map((id) => {
          const p = BUNDLE_PLANS[id];
          return (
            <button type="button" key={id} onClick={() => setPlan(id)} aria-pressed={plan === id}
              className={clsx("rounded-lg border p-4 text-left transition", plan === id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-gray-200 bg-white hover:border-gray-300")}>
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-gray-500">{p.tagline}</p>
              <p className="mt-2 text-2xl font-bold">{formatPrice(p.price[currency], currency)}<span className="text-sm font-normal text-gray-500">/month</span></p>
              <ul className="mt-2 space-y-1 text-xs text-gray-600">{p.features.map((x) => <li key={x}>· {x}</li>)}</ul>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-5 md:grid-cols-2">
        <label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Your name</span><input name="name" required className={input} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Business name</span><input name="businessName" required className={input} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Type of business</span>
          <select name="sector" required className={input} defaultValue="HOME_SERVICES">
            {SECTOR_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Your mobile (for call summaries and the morning plan)</span>
          <input name="phone" type="tel" required className={input} placeholder={country === "CA" ? "416 555 0123" : "98765 43210"} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Email</span><input name="email" type="email" required className={input} /></label>
        <label className="text-sm"><span className="mb-1 block font-medium text-gray-700">Password</span><input name="password" type="password" required minLength={8} className={input} /></label>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" disabled={loading} className="rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
          {loading ? "Creating your account…" : `Continue to payment · ${formatPrice(BUNDLE_PLANS[plan].price[currency], currency)}/month`}
        </button>
        <p className="text-xs text-gray-500">One account, one bill. Your calls, jobs and Google profile are set up for you in {BUNDLE_NAME} after payment.</p>
      </div>
    </form>
  );
}
