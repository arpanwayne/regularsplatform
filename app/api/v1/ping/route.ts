import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api-keys";

/**
 * GET /api/v1/ping — lets a connected system check its key ("Test connection")
 * and discover which business and locations it is writing to.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return NextResponse.json({ error: "Invalid or revoked API key" }, { status: 401 });

  return NextResponse.json({
    ok: true,
    business: { id: auth.business.id, name: auth.business.name, sector: auth.business.sector, status: auth.business.status },
    locations: auth.business.locations,
  });
}
