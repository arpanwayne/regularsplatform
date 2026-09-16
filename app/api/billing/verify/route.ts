import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentBusiness } from "@/lib/session";
import { verifyRazorpaySignature } from "@/lib/billing";
import { logEvent } from "@/lib/logger";

const schema = z.object({
  razorpay_order_id: z.string(),
  razorpay_payment_id: z.string(),
  razorpay_signature: z.string(),
});

const PLAN_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId: razorpay_order_id } });
  if (!payment || payment.businessId !== business.id) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const valid = verifyRazorpaySignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature,
  });

  if (!valid) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
    await logEvent({
      businessId: business.id,
      source: "BILLING",
      level: "ERROR",
      message: "Razorpay signature verification failed",
      meta: { orderId: razorpay_order_id },
    });
    return NextResponse.json({ error: "Payment verification failed" }, { status: 400 });
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", razorpayPaymentId: razorpay_payment_id, paidAt: now },
    }),
    prisma.business.update({
      where: { id: business.id },
      data: { plan: payment.plan, planExpiresAt: new Date(now.getTime() + PLAN_PERIOD_MS) },
    }),
  ]);

  await logEvent({
    businessId: business.id,
    source: "BILLING",
    level: "INFO",
    message: `Payment verified, plan upgraded to ${payment.plan}`,
  });

  return NextResponse.json({ ok: true, plan: payment.plan });
}
