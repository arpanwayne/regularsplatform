import { NextRequest, NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/session";
import { runWinback } from "@/lib/front-desk";

/**
 * POST /api/front-desk/winback  { "dryRun": true }  — owner-triggered win-back
 * for AT_RISK / DORMANT customers. dryRun previews how many would get a text.
 */
export async function POST(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "Business is suspended" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { dryRun?: boolean };
  return NextResponse.json(await runWinback(business, { dryRun: body.dryRun !== false }));
}
