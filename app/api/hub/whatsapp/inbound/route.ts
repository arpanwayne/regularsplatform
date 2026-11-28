import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { HubAuthError, consumeHubToken } from "@/lib/hub";
import { bearer } from "@/lib/hub-rules";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { parseJoin } from "@/lib/onboarding";
import { handleInboundWhatsApp, handleWhatsAppStatus, toWaMessage, type HubInboundMessage } from "@/lib/whatsapp-inbound";

/**
 * Loopdesk AI passes on WhatsApp for bundle clients (one number for the whole
 * bundle, Regulars retest 27 Nov 2026). Loopdesk has already worked out which
 * business it is (token sub), so here it runs exactly like Meta's webhook.
 *
 *   POST /api/hub/whatsapp/inbound
 *   Authorization: Bearer <Loopdesk JWT, purpose "whatsapp-inbound", sub = Loopdesk business id>
 *   { messages?: [ <WhatsApp Cloud API message> + profileName? ],
 *     statuses?: [ { id, status, error } ] }       (receipts for messages we sent through Loopdesk)
 *   → 200 { received, stored }
 */
type InboundBody = {
  messages?: HubInboundMessage[];
  statuses?: { id?: string; status?: string; error?: string | null }[];
};

export async function POST(req: NextRequest) {
  let claims;
  try {
    claims = await consumeHubToken(bearer(req.headers.get("authorization")), "whatsapp-inbound");
  } catch (err) {
    const e = err instanceof HubAuthError ? err : new HubAuthError("Invalid token");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  const body = ((await req.json().catch(() => null)) ?? {}) as InboundBody;

  // Receipts first: they only touch our own sent messages (by Meta id).
  for (const s of body.statuses ?? []) {
    if (typeof s.id !== "string" || typeof s.status !== "string") continue;
    await handleWhatsAppStatus({ id: s.id, status: s.status, ...(s.error ? { errors: [{ title: s.error }] } : {}) } as Parameters<typeof handleWhatsAppStatus>[0]).catch(() => {});
  }
  if (!body.messages?.length) return NextResponse.json({ received: true, stored: 0 });

  const business = await prisma.business.findUnique({ where: { hubBusinessId: claims.sub }, include: { locations: { orderBy: { createdAt: "asc" } } } });
  const first = business?.locations[0];
  if (!business || !first) return NextResponse.json({ error: "No Regulars business for this Loopdesk client" }, { status: 404 });
  if (business.status === "SUSPENDED" || first.status === "SUSPENDED") return NextResponse.json({ received: true, stored: 0 });
  const locations = business.locations.filter((l) => l.status !== "SUSPENDED");

  let stored = 0;
  for (const raw of body.messages) {
    const message = toWaMessage(raw);
    if (!message) continue;
    // A QR join names its branch: use the location with that code (A3, 28 Nov 2026).
    const text = message.text?.body ?? message.button?.text;
    const code = parseJoin(text)?.code;
    const loc = (code && locations.find((l) => l.joinCode === code)) || first;
    const location = { ...loc, business };
    const phones = [message.from, `+${message.from}`];
    // Loopdesk passes the owner's / a manager's messages here only when we wrote to them last (morning plan, approvals).
    const fromOwner = !!(
      (await prisma.growthSettings.findFirst({ where: { businessId: business.id, ownerPhone: { in: phones } }, select: { id: true } }))
      || first.ownerNotifyPhone && phones.includes(first.ownerNotifyPhone)
      || (await prisma.user.findFirst({ where: { role: "MANAGER", managedBusinessId: business.id, phone: { in: phones } }, select: { id: true } }))
    );
    try {
      if (await handleInboundWhatsApp({ location, message, profileName: raw.profileName ?? null, fromOwner, hubJoin: raw.hubJoin === true })) stored++;
    } catch (err) {
      await logEvent({ businessId: business.id, source: "WEBHOOK", level: "ERROR", message: "Failed processing a WhatsApp message from Loopdesk AI", meta: { error: err instanceof Error ? err.message : String(err) } });
    }
  }
  if (stored) await runSegmentationForBusiness(business.id);
  return NextResponse.json({ received: true, stored });
}
