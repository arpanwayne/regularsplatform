import { NextRequest, NextResponse } from "next/server";
import { tickAll } from "@/lib/growth/run";

// Hourly: each business with the Growth Manager on gets planned/briefed at its
// own local brief hour, approved actions run inside contact hours, and the
// weekly report goes out on Monday. Same CRON_SECRET as the other crons.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const results = await tickAll();
  return NextResponse.json({ businesses: results.length, results });
}
export const GET = handle;
export const POST = handle;
