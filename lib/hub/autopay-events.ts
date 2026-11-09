import type { FrontDeskPlan } from "@/lib/types";
import { isBundlePlan } from "@/lib/hub/plans";

// What each Razorpay webhook event means for a business. Kept apart from the
// database so the rules can be tested on their own.

const DAY = 86400000;

export type AutopayStatus = "OFF" | "PENDING" | "ON" | "ENDING" | "FAILED";

export type AutopayStore = {
  businessBySubscription(subscriptionId: string): Promise<{ id: string; autopayPlan: string | null } | null>;
  /** Records a payment once. False when it was already recorded. */
  recordCharge(c: { businessId: string; plan: string; paymentId: string; amountInMinor: number; currency: string }): Promise<boolean>;
  /** Marks a one-time bundle order paid. Null when unknown or already paid. */
  claimOrder(orderId: string, paymentId: string): Promise<{ businessId: string; plan: string } | null>;
  setAutopay(businessId: string, status: AutopayStatus): Promise<void>;
  activate(businessId: string, plan: FrontDeskPlan, opts: { until?: Date; reason: string }): Promise<void>;
  notifyOwner(businessId: string, subject: string, text: string): Promise<void>;
};

type Entity = Record<string, unknown>;
export type RazorpayEvent = { event: string; payload?: { subscription?: { entity?: Entity }; payment?: { entity?: Entity } } };

/** Paid through the end of the billing cycle, plus a day for the next charge to land. */
export const paidThrough = (currentEnd: unknown) =>
  typeof currentEnd === "number" && currentEnd > 0 ? new Date(currentEnd * 1000 + DAY) : undefined;

export async function handleRazorpayEvent(ev: RazorpayEvent, store: AutopayStore) {
  const sub = ev.payload?.subscription?.entity;
  const pay = ev.payload?.payment?.entity;

  if (ev.event === "payment.captured") {
    // One-time checkout: covers a customer who paid and closed the page before confirmation.
    if (!pay || typeof pay.order_id !== "string" || typeof pay.id !== "string") return "ignored";
    const order = await store.claimOrder(pay.order_id, pay.id);
    if (!order || !isBundlePlan(order.plan)) return "ignored";
    await store.activate(order.businessId, order.plan, { reason: `payment ${pay.id} (webhook)` });
    return "activated";
  }

  if (!sub || typeof sub.id !== "string") return "ignored";
  const biz = await store.businessBySubscription(sub.id);
  if (!biz) return "ignored";

  switch (ev.event) {
    case "subscription.charged": {
      if (!pay || typeof pay.id !== "string" || !isBundlePlan(biz.autopayPlan)) return "ignored";
      const fresh = await store.recordCharge({ businessId: biz.id, plan: biz.autopayPlan, paymentId: pay.id, amountInMinor: Number(pay.amount) || 0, currency: String(pay.currency || "INR") });
      await store.setAutopay(biz.id, "ON");
      if (!fresh) return "duplicate";
      await store.activate(biz.id, biz.autopayPlan, { until: paidThrough(sub.current_end), reason: `automatic payment ${pay.id}` });
      return "renewed";
    }
    case "subscription.activated":
      await store.setAutopay(biz.id, "ON");
      return "on";
    case "subscription.pending":
    case "subscription.halted":
      await store.setAutopay(biz.id, "FAILED");
      await store.notifyOwner(biz.id, "Your payment didn't go through", "We couldn't charge your card for this month's plan. Please update your payment on the Billing page to keep your tools running.");
      return "failed";
    case "subscription.cancelled":
    case "subscription.completed":
      await store.setAutopay(biz.id, "OFF");
      return "off";
    default:
      return "ignored";
  }
}
