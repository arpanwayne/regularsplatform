import { createHmac, timingSafeEqual } from "crypto";
import type { Plan } from "@/lib/types";
import { PLAN_PRICE_INR } from "@/lib/types";

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
