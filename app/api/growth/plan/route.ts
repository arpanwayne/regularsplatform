import { NextResponse } from "next/server";
import { getOwnerBusiness } from "@/lib/session";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { planForBusiness } from "@/lib/growth/planner";
import { executeApproved } from "@/lib/growth/executor";
import { GROWTH_UPGRADE_MESSAGE, growthAllowed } from "@/lib/growth/access";

/** POST /api/growth/plan — "Plan now" button: re-segment, plan, run anything auto-approved. */
export async function POST() {
  const business = await getOwnerBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "Business is suspended" }, { status: 403 });
  if (!growthAllowed(business)) return NextResponse.json({ error: GROWTH_UPGRADE_MESSAGE }, { status: 403 });
  await runSegmentationForBusiness(business.id);
  const plan = await planForBusiness(business.id, new Date(), { manual: true });
  const executed = await executeApproved(business.id);
  return NextResponse.json({ planned: plan.created.length, considered: plan.considered, executed: executed.filter((e) => e.status === "DONE").length });
}
