import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { createRazorpayOrder, isRazorpayConfigured } from "@/lib/billing";
import { PLANS } from "@/lib/types";
import { logEvent } from "@/lib/logger";

const schema = z.object({ plan: z.enum(PLANS as [string, ...string[]]) });

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isRazorpayConfigured()) {
    return NextResponse.json({ razorpayConfigured: false });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }
  const plan = parsed.data.plan as (typeof PLANS)[number];

  try {
    const order = await createRazorpayOrder({
      plan,
      receipt: `${business.id}-${Date.now()}`,
    });

    await prisma.payment.create({
      data: {
        businessId: business.id,
        plan,
        amountInPaise: order.amountInPaise,
        currency: order.currency,
        razorpayOrderId: order.orderId,
        status: "CREATED",
      },
    });

    return NextResponse.json({
      razorpayConfigured: true,
      orderId: order.orderId,
      amountInPaise: order.amountInPaise,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    await logEvent({
      businessId: business.id,
      source: "BILLING",
      level: "ERROR",
      message: "Razorpay order creation failed",
      meta: { error: err instanceof Error ? err.message : String(err) },
    });
    return NextResponse.json({ error: "Could not start checkout, try again" }, { status: 502 });
  }
}
