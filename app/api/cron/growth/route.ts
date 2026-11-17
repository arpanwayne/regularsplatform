import { NextRequest, NextResponse } from "next/server";
import { tickAll } from "@/lib/growth/run";
import { refreshInstagramTokens } from "@/lib/instagram";

// Hourly: each business with the Growth Manager on gets planned/briefed at its
// own local brief hour, approved actions run inside contact hours, and the
// weekly report goes out on Monday. Same CRON_SECRET as the other crons.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await tickAll();
  // Instagram add-on: keep long-lived tokens from expiring (60 days).
  const instagram = await refreshInstagramTokens().catch(() => null);
  return NextResponse.json({ businesses: results.length, results, instagram });
}
export const GET = handle;
export const POST = handle;
