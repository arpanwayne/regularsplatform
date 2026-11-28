import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { HubAuthError, consumeHubToken } from "@/lib/hub";
import { bearer } from "@/lib/hub-rules";
import { applyHubSync } from "@/lib/hub-sync";

/**
 * Loopdesk AI sends its customers (and copies of the messages it sent itself)
 * for a bundle client, so both panels show the same list and the same chat
 * (bug list 28 Nov 2026, A1/B5). Merge rules: lib/customer-sync-rules.ts.
 *
 *   POST /api/hub/sync
 *   Authorization: Bearer <Loopdesk JWT, purpose "customer-sync", sub = Loopdesk business id>
 *   { customers?: SyncCustomer[≤500], messages?: SyncMessage[≤500] }
 *   → 200 { created, updated, stored }
 */
export async function POST(req: NextRequest) {
  let claims;
  try {
    claims = await consumeHubToken(bearer(req.headers.get("authorization")), "customer-sync");
  } catch (err) {
    const e = err instanceof HubAuthError ? err : new HubAuthError("Invalid token");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const business = await prisma.business.findUnique({ where: { hubBusinessId: claims.sub }, select: { id: true } });
  if (!business) return NextResponse.json({ error: "No Regulars business for this Loopdesk client" }, { status: 404 });
  try {
    const r = await applyHubSync(business.id, await req.json().catch(() => null));
    return NextResponse.json(r);
  } catch (err) {
    await logEvent({ businessId: business.id, source: "API", level: "ERROR", message: "Customer sync from Loopdesk AI failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
