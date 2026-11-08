import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { createRazorpayOrderFor, isRazorpayConfigured } from "@/lib/billing";
import { BUNDLE_PLANS, BUNDLE_PLAN_IDS, currencyFor, isBundlePlan } from "@/lib/hub/plans";
import { logEvent } from "@/lib/logger";

const schema = z.object({ plan: z.enum(BUNDLE_PLAN_IDS as [string, ...string[]]).optional() });

/**
 * One bill for the whole bundle: a Razorpay order for 30 days of the plan,
 * in CAD for Canada and INR for India. Verified by /api/billing/verify,
 * which then turns every tool on (lib/hub/bundle.ts → activateBundle).
 */
export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "This account is suspended" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const plan = parsed.data.plan ?? business.frontDeskPlan;
  if (!isBundlePlan(plan)) return NextResponse.json({ error: "Pick a plan first" }, { status: 400 });

  if (!isRazorpayConfigured()) return NextResponse.json({ razorpayConfigured: false });

  const currency = currencyFor(business.country);
  const amountInMinor = BUNDLE_PLANS[plan].price[currency] * 100;
  try {
    const order = await createRazorpayOrderFor({ amountInMinor, currency, receipt: `b-${business.id}-${Date.now()}` });
    await prisma.payment.create({
      data: { businessId: business.id, kind: "BUNDLE", plan, amountInPaise: amountInMinor, currency, razorpayOrderId: order.orderId, status: "CREATED" },
    });
    return NextResponse.json({ razorpayConfigured: true, orderId: order.orderId, amountInMinor, currency, keyId: process.env.RAZORPAY_KEY_ID, plan });
  } catch (err) {
    await logEvent({ businessId: business.id, source: "BILLING", level: "ERROR", message: "Bundle order creation failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return NextResponse.json({ error: "Could not start checkout, try again" }, { status: 502 });
  }
}
