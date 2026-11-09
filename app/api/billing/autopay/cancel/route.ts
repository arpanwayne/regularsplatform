import { NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/session";
import { logEvent } from "@/lib/logger";
import { autopayStore, cancelAutopay } from "@/lib/hub/autopay";

/** Stops future charges. The plan keeps running to the end of what's been paid for. */
export async function POST() {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!business.razorpaySubscriptionId || !["ON", "FAILED", "PENDING"].includes(business.autopayStatus)) return NextResponse.json({ error: "Automatic payment isn't on" }, { status: 409 });
  try {
    await cancelAutopay(business.razorpaySubscriptionId, business.autopayStatus === "ON");
    await autopayStore.setAutopay(business.id, business.autopayStatus === "ON" ? "ENDING" : "OFF");
    await logEvent({ businessId: business.id, source: "BILLING", level: "INFO", message: "Owner turned off automatic payment" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    await logEvent({ businessId: business.id, source: "BILLING", level: "ERROR", message: "Could not turn off automatic payment", meta: { error: err instanceof Error ? err.message : String(err) } });
    return NextResponse.json({ error: "That didn't work. Please try again, or contact us and we'll stop it for you." }, { status: 502 });
  }
}
