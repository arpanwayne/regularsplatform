import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBusiness } from "@/lib/session";
import { logEvent } from "@/lib/logger";
import { autopayStore, fetchSubscription, verifySubscriptionPayment } from "@/lib/hub/autopay";
import { paidThrough } from "@/lib/hub/autopay-events";
import { BUNDLE_PLANS, currencyFor, isBundlePlan } from "@/lib/hub/plans";

const schema = z.object({ razorpay_payment_id: z.string(), razorpay_subscription_id: z.string(), razorpay_signature: z.string() });

/** Turns the tools on as soon as checkout finishes. The webhook is the backup; only one counts. */
export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subscriptionId, razorpay_signature: signature } = parsed.data;

  if (business.razorpaySubscriptionId !== subscriptionId || !isBundlePlan(business.autopayPlan)) return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  if (!verifySubscriptionPayment(paymentId, subscriptionId, signature)) {
    await logEvent({ businessId: business.id, source: "BILLING", level: "ERROR", message: "Automatic payment signature check failed" });
    return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  }

  const plan = business.autopayPlan;
  const currency = currencyFor(business.country);
  const fresh = await autopayStore.recordCharge({ businessId: business.id, plan, paymentId, amountInMinor: BUNDLE_PLANS[plan].price[currency] * 100, currency });
  await autopayStore.setAutopay(business.id, "ON");
  if (fresh) {
    const sub = await fetchSubscription(subscriptionId).catch(() => null);
    await autopayStore.activate(business.id, plan, { until: paidThrough(sub?.current_end), reason: `automatic payment ${paymentId}` });
  }
  return NextResponse.json({ ok: true });
}
