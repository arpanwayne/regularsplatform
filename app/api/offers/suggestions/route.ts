import { NextRequest, NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/session";
import { allow } from "@/lib/rate-limit";
import { segmentInsights } from "@/lib/segment-insights";

/**
 * POST /api/offers/suggestions { ai?: boolean } — re-scores every customer,
 * then returns each segment's numbers and one targeted offer idea per segment
 * (written by AI when ai=true, ready-made otherwise).
 */
export async function POST(req: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { business } = member;
  const body = (await req.json().catch(() => ({}))) as { ai?: unknown };
  const ai = body.ai === true;
  if (ai && !(await allow(`offer-ideas:${business.id}`, 20, 60 * 60 * 1000))) return NextResponse.json({ error: "That's a lot of AI ideas this hour. Try again later." }, { status: 429 });
  return NextResponse.json(await segmentInsights(business, { ai }));
}
