import { NextRequest, NextResponse } from "next/server";
import { flushHubSync } from "@/lib/hub-sync";

// Catch-up for the Loopdesk ⇄ Regulars customer sync: sends anything a failed
// push left pending. Changes normally go within seconds (lib/prisma.ts).
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await flushHubSync());
}

export const GET = handle;
export const POST = handle;
