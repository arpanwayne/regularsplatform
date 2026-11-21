import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { runWinback } from "@/lib/front-desk";

// Daily win-back sweep for Front Desk "Answer + Return" and "Grow" clients:
// re-segment (so pure recency changes are picked up), then text at-risk and
// dormant customers who haven't had a win-back in 30 days. Same CRON_SECRET
// protection as the plan-downgrade cron.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const businesses = await prisma.business.findMany({
    where: { status: "ACTIVE", frontDeskPlan: { in: ["ANSWER_RETURN", "GROW"] } },
  });
  const results = [];
  for (const b of businesses) {
    await runSegmentationForBusiness(b.id);
    results.push({ businessId: b.id, ...(await runWinback(b, { limit: 100 })) });
  }
  return NextResponse.json({ businesses: results.length, results });
}

export const GET = handle;
export const POST = handle;
