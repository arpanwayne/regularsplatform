import { NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/session";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { planForBusiness } from "@/lib/growth/planner";
import { executeApproved } from "@/lib/growth/executor";

/** POST /api/growth/plan — "Plan now" button: re-segment, plan, run anything auto-approved. */
export async function POST() {
  const business = await getCurrentBusiness();
  if (!business) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (business.status === "SUSPENDED") return NextResponse.json({ error: "Business is suspended" }, { status: 403 });
  await runSegmentationForBusiness(business.id);
  const plan = await planForBusiness(business.id);
  const executed = await executeApproved(business.id);
  return NextResponse.json({ planned: plan.created.length, considered: plan.considered, executed: executed.filter((e) => e.status === "DONE").length });
}
