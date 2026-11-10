import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentBusiness } from "@/lib/session";
import { isRazorpayConfigured } from "@/lib/billing";
import { logEvent } from "@/lib/logger";
import { cancelAutopay, startAutopay } from "@/lib/hub/autopay";
import { BUNDLE_PLAN_IDS, currencyFor, isBundlePlan } from "@/lib/hub/plans";

const schema = z.object({ plan: z.enum(BUNDLE_PLAN_IDS as [string, ...string[]]).optional() });

export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "This account is suspended" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const plan = parsed.data.plan ?? business.frontDeskPlan;
  if (!isBundlePlan(plan)) return NextResponse.json({ error: "Pick a plan first" }, { status: 400 });
  if (business.autopayStatus === "ON" || business.autopayStatus === "ENDING") {
    return NextResponse.json({ error: "Automatic payment is already set up. To change plan, turn it off first and start again when it ends." }, { status: 409 });
  }
  if (!isRazorpayConfigured()) return NextResponse.json({ razorpayConfigured: false });
  try {
    // Razorpay keeps retrying a failed subscription; stop it so the card can't be charged twice.
    if (business.autopayStatus === "FAILED" && business.razorpaySubscriptionId) await cancelAutopay(business.razorpaySubscriptionId, false);
    const subscriptionId = await startAutopay(business.id, plan, currencyFor(business.country));
    return NextResponse.json({ razorpayConfigured: true, subscriptionId, keyId: process.env.RAZORPAY_KEY_ID, plan });
  } catch (err) {
    await logEvent({ businessId: business.id, source: "BILLING", level: "ERROR", message: "Could not start automatic payment", meta: { error: err instanceof Error ? err.message : String(err) } });
    return NextResponse.json({ error: "Automatic payment isn't available right now. You can pay once for 30 days instead." }, { status: 502 });
  }
}
