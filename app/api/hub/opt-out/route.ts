import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { HubAuthError, consumeHubToken } from "@/lib/hub";
import { bearer, phoneVariants } from "@/lib/hub-rules";

/**
 * Loopdesk AI tells Regulars who said STOP (or came back) on the business's
 * WhatsApp, so the two apps never disagree (bug 1, 27 Nov 2026: a number
 * opted out in Loopdesk was still "Waiting for YES" here and got asked again).
 *
 *   POST /api/hub/opt-out
 *   Authorization: Bearer <Loopdesk JWT, purpose "opt-out">
 *   { hubBusinessId, phones: ["917087064479", …], optedOut: true | false }
 *   → 200 { updated }
 *
 * Only customers that already exist here change; nobody is created.
 */
const bodySchema = z.object({
  hubBusinessId: z.string().min(1),
  phones: z.array(z.string().min(6).max(20)).min(1).max(500),
  optedOut: z.boolean(),
});

export async function POST(req: NextRequest) {
  let claims;
  try {
    claims = await consumeHubToken(bearer(req.headers.get("authorization")), "opt-out");
  } catch (err) {
    const e = err instanceof HubAuthError ? err : new HubAuthError("Invalid token");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", detail: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  if (body.hubBusinessId !== claims.sub) return NextResponse.json({ error: "Token is for a different business" }, { status: 403 });

  const biz = await prisma.business.findUnique({ where: { hubBusinessId: body.hubBusinessId }, select: { id: true } });
  if (!biz) return NextResponse.json({ error: "No Regulars business for this Loopdesk client" }, { status: 404 });

  const phones = Array.from(new Set(body.phones.flatMap(phoneVariants)));
  if (!phones.length) return NextResponse.json({ updated: 0 });
  const now = new Date();
  const r = await prisma.customer.updateMany({
    where: { businessId: biz.id, phone: { in: phones }, optedOut: !body.optedOut },
    data: body.optedOut ? { optedOut: true, optedOutAt: now } : { optedOut: false, optedOutAt: null },
  });
  if (r.count) {
    await logEvent({ businessId: biz.id, source: "WHATSAPP", level: "INFO", message: `Loopdesk AI: ${r.count} customer(s) ${body.optedOut ? "opted out (STOP)" : "opted back in"}` });
  }
  return NextResponse.json({ updated: r.count });
}
