import { NextRequest, NextResponse } from "next/server";
import { HubAuthError, consumeHubToken } from "@/lib/hub";
import { bearer } from "@/lib/hub-rules";
import { hubBusinessForJoinCode } from "@/lib/hub-sync";

/**
 * Loopdesk AI got "JOIN <code>" on the bundle's WhatsApp number and the code
 * isn't one of its own: is it a Regulars QR? (bug list 28 Nov 2026, A3/B3 —
 * the Regulars QR "JOIN 9H75JS" was answered by Loyvexa instead.)
 *
 *   POST /api/hub/join-code
 *   Authorization: Bearer <Loopdesk JWT, purpose "join-lookup">
 *   { code }  → 200 { hubBusinessId: string | null }
 */
export async function POST(req: NextRequest) {
  try {
    await consumeHubToken(bearer(req.headers.get("authorization")), "join-lookup");
  } catch (err) {
    const e = err instanceof HubAuthError ? err : new HubAuthError("Invalid token");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const body = ((await req.json().catch(() => null)) ?? {}) as { code?: unknown };
  return NextResponse.json({ hubBusinessId: await hubBusinessForJoinCode(String(body.code ?? "")) });
}
