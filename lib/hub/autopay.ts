import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { sendEmail } from "@/lib/email";
import { activateBundle } from "@/lib/hub/bundle";
import { BUNDLE_PLANS, type Currency } from "@/lib/hub/plans";
import type { FrontDeskPlan } from "@/lib/types";
import type { AutopayStore } from "@/lib/hub/autopay-events";

// Automatic monthly payment through Razorpay Subscriptions. Foreign cards need
// international recurring payments enabled on the Razorpay account.

async function razorpay<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${auth}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!res.ok) throw new Error(`Razorpay ${path} failed (HTTP ${res.status}): ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

/** One Razorpay plan per price. A price change simply creates a new one. */
async function razorpayPlanFor(plan: FrontDeskPlan, currency: Currency) {
  const amount = BUNDLE_PLANS[plan].price[currency] * 100;
  const key = `${plan}:${currency}:${amount}`;
  const saved = await prisma.razorpayPlan.findUnique({ where: { key } });
  if (saved) return saved.planId;
  const created = await razorpay<{ id: string }>("/plans", { period: "monthly", interval: 1, item: { name: BUNDLE_PLANS[plan].name, amount, currency } });
  await prisma.razorpayPlan.create({ data: { key, planId: created.id } });
  return created.id;
}

export async function startAutopay(businessId: string, plan: FrontDeskPlan, currency: Currency) {
  const planId = await razorpayPlanFor(plan, currency);
  const sub = await razorpay<{ id: string }>("/subscriptions", { plan_id: planId, total_count: 120, quantity: 1, customer_notify: 1, notes: { businessId, plan } });
  await prisma.business.update({ where: { id: businessId }, data: { razorpaySubscriptionId: sub.id, autopayPlan: plan, autopayStatus: "PENDING" } });
  return sub.id;
}

export const fetchSubscription = (id: string) => razorpay<{ current_end?: number; status?: string }>(`/subscriptions/${id}`);

export async function cancelAutopay(subscriptionId: string, atCycleEnd: boolean) {
  await razorpay(`/subscriptions/${subscriptionId}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });
}

function hmacMatches(secret: string | undefined, data: string, signature: string | null) {
  if (!secret || !signature) return false;
  const a = Buffer.from(createHmac("sha256", secret).update(data).digest("hex"), "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const verifySubscriptionPayment = (paymentId: string, subscriptionId: string, signature: string) =>
  hmacMatches(process.env.RAZORPAY_KEY_SECRET, `${paymentId}|${subscriptionId}`, signature);

export const verifyRazorpayWebhook = (rawBody: string, signature: string | null) =>
  hmacMatches(process.env.RAZORPAY_WEBHOOK_SECRET, rawBody, signature);

export const autopayStore: AutopayStore = {
  businessBySubscription: (id) => prisma.business.findUnique({ where: { razorpaySubscriptionId: id }, select: { id: true, autopayPlan: true } }),
  async recordCharge({ businessId, plan, paymentId, amountInMinor, currency }) {
    try {
      await prisma.payment.create({
        // razorpayOrderId is the unique key; a subscription charge has no order of ours.
        data: { businessId, kind: "BUNDLE", plan, amountInPaise: amountInMinor, currency, razorpayOrderId: `autopay:${paymentId}`, razorpayPaymentId: paymentId, status: "PAID", paidAt: new Date() },
      });
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") return false;
      throw err;
    }
  },
  async claimOrder(orderId, paymentId) {
    const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: orderId } });
    if (!payment || payment.kind !== "BUNDLE") return null;
    const claimed = await prisma.payment.updateMany({ where: { id: payment.id, status: "CREATED" }, data: { status: "PAID", razorpayPaymentId: paymentId, paidAt: new Date() } });
    return claimed.count ? { businessId: payment.businessId, plan: payment.plan } : null;
  },
  async setAutopay(businessId, status) { await prisma.business.update({ where: { id: businessId }, data: { autopayStatus: status } }); },
  async activate(businessId, plan, opts) { await activateBundle(businessId, plan, opts); },
  async notifyOwner(businessId, subject, text) {
    const biz = await prisma.business.findUnique({ where: { id: businessId }, include: { owner: { select: { email: true } } } });
    if (biz) await sendEmail({ to: biz.owner.email, subject, text });
    await logEvent({ businessId, source: "BILLING", level: "WARN", message: subject });
  },
};

/** Cron: a reminder three days before the end, for anyone not on automatic payment. */
export async function sendRenewalReminders(now = new Date()) {
  const soon = new Date(now.getTime() + 3 * 86400000);
  const repeatAfter = new Date(now.getTime() - 5 * 86400000);
  const due = await prisma.business.findMany({
    where: { bundleStatus: "ACTIVE", autopayStatus: { not: "ON" }, bundlePaidUntil: { gte: now, lte: soon }, OR: [{ renewalReminderAt: null }, { renewalReminderAt: { lt: repeatAfter } }] },
    include: { owner: { select: { email: true } } },
  });
  const appUrl = process.env.APP_URL || "";
  for (const b of due) {
    await sendEmail({ to: b.owner.email, subject: "Your plan ends in 3 days", text: `Your plan ends soon. Renew here to keep your AI receptionist and tools running, or turn on automatic payment so you don't have to think about it:\n\n${appUrl}/dashboard/billing` });
    await prisma.business.update({ where: { id: b.id }, data: { renewalReminderAt: now } });
  }
  return due.length;
}
