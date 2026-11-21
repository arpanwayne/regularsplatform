import { NextRequest, NextResponse } from "next/server";
import { sweepExpiredPlans } from "@/lib/billing";

// Meant to be called on a schedule (e.g. Vercel Cron, once daily) so a
// lapsed plan gets downgraded even for a business nobody happens to load
// that day — getCurrentBusiness() already does this lazily per-request,
// this just covers the gap. Protected by a shared secret since it's an
// unauthenticated route by necessity (cron callers don't have a user
// session) — set CRON_SECRET and configure the scheduler to send it as
// `Authorization: Bearer <secret>`. Without CRON_SECRET configured, this
// route refuses to run rather than being an open door.
//
// Exposed as both GET and POST: Vercel Cron Jobs call via GET (and
// auto-attach the Authorization header when CRON_SECRET is set as an env
// var of that exact name — see Vercel's cron docs), while a generic
// scheduler might prefer POST.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const downgraded = await sweepExpiredPlans();
  return NextResponse.json({ downgraded });
}

export const GET = handle;
export const POST = handle;
