import { NextRequest, NextResponse } from "next/server";
import { logEvent } from "@/lib/logger";
import { autopayStore, verifyRazorpayWebhook } from "@/lib/hub/autopay";
import { handleRazorpayEvent, type RazorpayEvent } from "@/lib/hub/autopay-events";

/**
 * Razorpay → Settings → Webhooks. Events: subscription.activated, .charged,
 * .pending, .halted, .cancelled, .completed, payment.captured.
 * An error returns 500 so Razorpay sends the event again.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyRazorpayWebhook(raw, req.headers.get("x-razorpay-signature"))) return new NextResponse("Invalid signature", { status: 401 });
  let event: RazorpayEvent;
  try { event = JSON.parse(raw); } catch { return new NextResponse("Invalid JSON", { status: 400 }); }
  try {
    const result = await handleRazorpayEvent(event, autopayStore);
    return NextResponse.json({ result });
  } catch (err) {
    await logEvent({ source: "BILLING", level: "ERROR", message: `Razorpay webhook ${event.event} failed`, meta: { error: err instanceof Error ? err.message : String(err) } });
    return new NextResponse("Failed", { status: 500 });
  }
}
