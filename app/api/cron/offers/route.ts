import { NextRequest, NextResponse } from "next/server";
import { processOffers } from "@/lib/offers";
import { processQueuedConsentRequests } from "@/lib/onboarding";
import { flushHubSync } from "@/lib/hub-sync";

// Hourly: offers (expire unanswered approvals at 48h, remind the owner at 24h,
// send approved offers that are due, in contact hours) and queued YES/NO
// consent requests (imports). Same CRON_SECRET protection as the other crons.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const offers = await processOffers(now);
  const consent = await processQueuedConsentRequests(now);
  // Loopdesk ⇄ Regulars customer sync catch-up (bug list 28 Nov 2026, A1).
  const hubSync = await flushHubSync().catch(() => null);
  return NextResponse.json({ offers, consent, hubSync });
}

export const GET = handle;
export const POST = handle;
