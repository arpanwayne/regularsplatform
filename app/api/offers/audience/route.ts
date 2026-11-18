import { NextRequest, NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/session";
import { countAudience, parseSegments } from "@/lib/offers";

/** GET /api/offers/audience?segments=AT_RISK,DORMANT — how many customers an offer would reach (consent and opt-outs applied). */
export async function GET(req: NextRequest) {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const count = await countAudience(business, parseSegments(req.nextUrl.searchParams.get("segments")));
  return NextResponse.json({ count });
}
