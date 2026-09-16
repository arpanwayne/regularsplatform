import { NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/session";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";

export async function POST() {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSegmentationForBusiness(business.id);
  return NextResponse.json(result);
}
