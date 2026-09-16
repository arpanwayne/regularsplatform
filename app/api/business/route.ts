import { NextResponse } from "next/server";
import { getCurrentBusiness } from "@/lib/session";

// WhatsApp connection fields used to live directly on Business; they moved
// to Location (a business can have multiple, each with its own WhatsApp
// number) — see app/api/locations/route.ts and app/api/locations/[id]/route.ts.
export async function GET() {
  const business = await getCurrentBusiness();
  if (!business) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ business });
}
