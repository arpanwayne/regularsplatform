"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { PLANS, PLAN_PRICE_INR, type Plan } from "@/lib/types";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

export function BillingCheckout({ currentPlan }: { currentPlan: string }) {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function upgrade(plan: Plan) {
    setNotice(null);
    setLoadingPlan(plan);

    const res = await fetch("/api/billing/create-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    setLoadingPlan(null);

    if (!res.ok) {
      setNotice(data?.error ?? "Kuch galat ho gaya, phir try karo.");
      return;
    }
    if (!data.razorpayConfigured) {
      setNotice(
        "Payments abhi platform pe configure nahi hain — apne admin se contact karo plan upgrade karne ke liye."
      );
      return;
    }
    if (typeof window.Razorpay !== "function") {
      setNotice("Checkout load nahi ho paya, page refresh karke try karo.");
      return;
    }

    const rzp = new window.Razorpay({
      key: data.keyId,
      order_id: data.orderId,
      amount: data.amountInPaise,
      currency: data.currency,
      name: "Regulars",
      description: `${plan} plan — 30 din`,
      handler: async (response: {
        razorpay_order_id: string;
        razorpay_payment_id: string;
        razorpay_signature: string;
      }) => {
        const verifyRes = await fetch("/api/billing/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(response),
        });
        if (verifyRes.ok) {
          router.refresh();
        } else {
          setNotice("Payment ho gaya lekin verify nahi ho paya — apne admin se contact karo.");
        }
      },
    });
    rzp.open();
  }

  return (
    <div className="space-y-4">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="lazyOnload" />
      {notice && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan}
            className={`rounded-lg border p-4 ${
              plan === currentPlan ? "border-brand-600 bg-brand-50" : "border-gray-200 bg-white"
            }`}
          >
            <p className="font-semibold">{plan}</p>
            <p className="text-2xl font-bold mt-1">
              ₹{PLAN_PRICE_INR[plan].toLocaleString("en-IN")}
              <span className="text-sm font-normal text-gray-500">/month</span>
            </p>
            {plan === currentPlan ? (
              <p className="mt-3 text-sm font-medium text-brand-700">Current plan</p>
            ) : (
              <button
                onClick={() => upgrade(plan)}
                disabled={loadingPlan === plan}
                className="mt-3 w-full rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {loadingPlan === plan ? "Opening checkout…" : `Switch to ${plan}`}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
