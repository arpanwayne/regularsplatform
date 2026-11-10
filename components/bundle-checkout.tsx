"use client";

import { useState } from "react";
import { BUNDLE_NAME } from "@/lib/brand";
import { useRouter } from "next/navigation";
import Script from "next/script";
import clsx from "clsx";
import { BUNDLE_PLANS, BUNDLE_PLAN_IDS, formatPrice, isBundlePlan, type Currency } from "@/lib/hub/plans";
import type { FrontDeskPlan } from "@/lib/types";

/** Pay (or renew, or change plan) for the whole bundle in one checkout. */
export function BundleCheckout({ currentPlan, status, currency, autopay, autopayPlan, paidUntil }: { currentPlan: FrontDeskPlan; status: string; currency: Currency; autopay: string; autopayPlan: string | null; paidUntil: string | null }) {
  const router = useRouter();
  const [plan, setPlan] = useState<FrontDeskPlan>(currentPlan);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function pay() {
    setNotice(null);
    setBusy(true);
    const res = await fetch("/api/billing/bundle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setNotice(data?.error ?? "Something went wrong, please try again."); return; }
    if (!data.razorpayConfigured) { setBusy(false); setNotice("Online payment isn't switched on yet. Our team will activate your plan — reply to your welcome email or call us."); return; }
    if (typeof window.Razorpay !== "function") { setBusy(false); setNotice("Checkout didn't load. Refresh the page and try again."); return; }
    const rzp = new window.Razorpay({
      key: data.keyId, order_id: data.orderId, amount: data.amountInMinor, currency: data.currency,
      name: BUNDLE_NAME, description: `${BUNDLE_PLANS[plan].name} — 30 days`,
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        setNotice("Payment received — setting up your tools…");
        const v = await fetch("/api/billing/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(response) });
        setBusy(false);
        if (v.ok) { router.push("/dashboard"); router.refresh(); }
        else setNotice("Payment went through but we couldn't confirm it. Don't pay again — our team will sort it out.");
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.open();
  }

  async function startAutopay() {
    setNotice(null);
    setBusy(true);
    const res = await fetch("/api/billing/autopay", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setNotice(data?.error ?? "Something went wrong, please try again."); return; }
    if (!data.razorpayConfigured) { setBusy(false); setNotice("Online payment isn't switched on yet. Our team will activate your plan — reply to your welcome email or call us."); return; }
    if (typeof window.Razorpay !== "function") { setBusy(false); setNotice("Checkout didn't load. Refresh the page and try again."); return; }
    const rzp = new window.Razorpay({
      key: data.keyId, subscription_id: data.subscriptionId,
      name: BUNDLE_NAME, description: `${BUNDLE_PLANS[plan].name}, monthly`,
      handler: async (response: { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }) => {
        setNotice("Payment received — setting up your tools…");
        const v = await fetch("/api/billing/autopay/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(response) });
        setBusy(false);
        if (v.ok) { router.push("/dashboard"); router.refresh(); }
        else setNotice("Payment went through but we couldn't confirm it yet. Don't pay again — it should update within a few minutes.");
      },
      modal: { ondismiss: () => setBusy(false) },
    });
    rzp.open();
  }

  async function stopAutopay() {
    if (!window.confirm("Turn off automatic payment? Your plan keeps running until the end of what you've paid for.")) return;
    setBusy(true);
    const res = await fetch("/api/billing/autopay/cancel", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setNotice(data?.error ?? "That didn't work. Please try again."); return; }
    router.refresh();
  }

  const autopayOn = autopay === "ON" || autopay === "FAILED";
  const locked = autopay === "ON" || autopay === "ENDING";
  const verb = status === "ACTIVE" ? (plan === currentPlan ? "Renew for 30 days" : "Switch plan") : status === "LAPSED" ? "Reactivate" : "Pay and start";
  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      <div className="grid gap-3 md:grid-cols-3">
        {BUNDLE_PLAN_IDS.map((id) => {
          const p = BUNDLE_PLANS[id];
          return (
            <button key={id} type="button" onClick={() => setPlan(id)} aria-pressed={plan === id}
              className={clsx("rounded-lg border p-4 text-left", plan === id ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600" : "border-gray-200 bg-white hover:border-gray-300")}>
              <div className="flex items-center justify-between"><p className="font-semibold">{p.name}</p>
                {id === currentPlan && status === "ACTIVE" && <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-800">current</span>}</div>
              <p className="mt-1 text-2xl font-bold">{formatPrice(p.price[currency], currency)}<span className="text-sm font-normal text-gray-500">/month</span></p>
              <ul className="mt-2 space-y-1 text-xs text-gray-600">{p.features.map((x) => <li key={x}>· {x}</li>)}</ul>
            </button>
          );
        })}
      </div>
      {notice && <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{notice}</div>}
      {autopay === "ENDING" && <p className="text-sm text-gray-700">Automatic payment is off. Your plan runs until {paidUntil ?? "the end of this period"}.</p>}
      {locked && autopay === "ON" && (
        <p className="text-sm text-gray-700">Automatic payment is on for {isBundlePlan(autopayPlan) ? BUNDLE_PLANS[autopayPlan].name : "your plan"}.{paidUntil ? ` Paid until ${paidUntil}.` : ""} To change plan, turn it off first.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!locked && (
          <button onClick={startAutopay} disabled={busy} className="rounded-md bg-brand-600 px-5 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-60">
            {busy ? "Opening checkout…" : `Pay automatically · ${formatPrice(BUNDLE_PLANS[plan].price[currency], currency)}/month`}
          </button>
        )}
        {autopay !== "ON" && (
          <button onClick={pay} disabled={busy} className="rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60">
            {`${verb} once · ${formatPrice(BUNDLE_PLANS[plan].price[currency], currency)}`}
          </button>
        )}
        {autopayOn && <button onClick={stopAutopay} disabled={busy} className="text-sm text-gray-600 underline">Turn off automatic payment</button>}
      </div>
      {!locked && <p className="text-xs text-gray-500">With automatic payment, your card is charged {formatPrice(BUNDLE_PLANS[plan].price[currency], currency)} every month until you turn it off here.</p>}
    </div>
  );
}
