import { createHmac, timingSafeEqual } from "crypto";
import type { Business } from "@prisma/client";
import type { Plan } from "@/lib/types";
import { PLAN_PRICE_INR } from "@/lib/types";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";

export const RENEWAL_REMINDER_WINDOW_DAYS = 3;

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/**
 * Creates a Razorpay Order for one month of the given plan. Throws if
 * Razorpay isn't configured — callers must check isRazorpayConfigured()
 * first and show an honest "billing not set up yet" state instead of a
 * fake checkout (same pattern as lib/calling-provider.ts).
 */
export async function createRazorpayOrder(params: {
  plan: Plan;
  receipt: string;
}): Promise<{ orderId: string; amountInPaise: number; currency: string }> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("Razorpay is not configured");
  }

  const amountInPaise = PLAN_PRICE_INR[params.plan] * 100;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: "INR",
      receipt: params.receipt,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Razorpay order creation failed (HTTP ${res.status}): ${body}`);
  }

  const data = await res.json();
  return { orderId: data.id, amountInPaise, currency: "INR" };
}

/**
 * Verifies the HMAC-SHA256 signature Razorpay's checkout returns on
 * success, over `${orderId}|${paymentId}`, keyed with RAZORPAY_KEY_SECRET.
 * This is the step that actually proves the payment happened — never mark
 * a Payment PAID without it.
 */
export function verifyRazorpaySignature(params: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) return false;

  const expected = createHmac("sha256", keySecret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(params.signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Recurring billing "lite": there's no saved payment method / UPI Autopay
 * mandate wired in (that needs a live Razorpay Subscriptions setup to build
 * against — see README), so nothing auto-*charges*. What this platform can
 * honestly do without that is auto-*downgrade* a lapsed plan back to
 * STARTER, so a business never silently keeps GROWTH/PRO perks after their
 * paid period ends. Called lazily from getCurrentBusiness() on every
 * request, and sweepable in bulk via the cron route for businesses that
 * aren't actively being viewed.
 */
export async function downgradeIfExpired(business: Business): Promise<Business> {
  if (business.plan === "STARTER" || !business.planExpiresAt) return business;
  if (business.planExpiresAt.getTime() > Date.now()) return business;

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: { plan: "STARTER", planExpiresAt: null },
  });
  await logEvent({
    businessId: business.id,
    source: "BILLING",
    level: "INFO",
    message: `Plan lapsed and was auto-downgraded from ${business.plan} to STARTER`,
  });
  return updated;
}

export async function sweepExpiredPlans(): Promise<number> {
  const expired = await prisma.business.findMany({
    where: { plan: { not: "STARTER" }, planExpiresAt: { lt: new Date() } },
  });
  for (const business of expired) {
    await downgradeIfExpired(business);
  }
  return expired.length;
}
