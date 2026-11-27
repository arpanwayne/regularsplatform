import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature, WhatsAppWebhookPayload } from "@/lib/whatsapp";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { logEvent } from "@/lib/logger";
import { sharedCountries } from "@/lib/whatsapp-sender";
import { parseJoin } from "@/lib/onboarding";
import { handleInboundWhatsApp, handleWhatsAppStatus, type LocWithBusiness } from "@/lib/whatsapp-inbound";

// GET — Meta's webhook verification handshake. Each Location gets its own
// whatsappVerifyToken (shown on the Settings page); we also accept the
// global WHATSAPP_WEBHOOK_VERIFY_TOKEN, which is the one to use for the
// shared Loopdesk number and for a first-time setup.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN && token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  const location = await prisma.location.findFirst({ where: { whatsappVerifyToken: token } });
  if (location) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}



/** Meta's "Test" button on the webhook settings page sends this made-up number id. */
const META_SAMPLE_PHONE_NUMBER_IDS = ["123456123"];

/**
 * Inbound on the shared number (+91 90414 36801): many businesses send from
 * it, so work out which one this person is talking to.
 *  0. a QR scan: "JOIN <code>" names the location itself
 *  1. the owner of a business on the shared number (brief replies, approvals)
 *     or one of its managers ("add Rahul 98…")
 *  2. the business that last messaged this person from the shared number —
 *     Regulars itself, or a tool sending through the hub (Loyvexa dealers)
 *  3. the shared-number business this phone is already a customer of
 */
async function routeShared(from: string, text?: string): Promise<{ location: LocWithBusiness; owner: boolean } | null> {
  const countries = sharedCountries();
  const phones = [from, `+${from}`];
  const onShared = { whatsappPhoneNumberId: null } as const;

  const join = parseJoin(text);
  if (join) {
    const joined = await prisma.location.findFirst({ where: { ...onShared, joinCode: join.code }, include: { business: true } });
    if (joined) return { location: joined, owner: false };
  }

  // Owners in any country can get their brief from the shared number
  // (lib/whatsapp-send.ts ownerWhatsAppSender), so their replies route here too.
  const settings = await prisma.growthSettings.findFirst({
    where: { ownerPhone: { in: phones }, enabled: true },
    include: { business: { include: { locations: { where: onShared, orderBy: { createdAt: "asc" }, take: 1 } } } },
  });
  const ownerLoc = settings?.business.locations[0]
    ?? (await prisma.location.findFirst({ where: { ...onShared, ownerNotifyPhone: { in: phones } } }));
  if (ownerLoc) {
    const location = await prisma.location.findUnique({ where: { id: ownerLoc.id }, include: { business: true } });
    if (location) return { location, owner: true };
  }
  // A manager (Dashboard → Team saves their mobile as digits).
  const manager = await prisma.user.findFirst({
    where: { role: "MANAGER", phone: { in: phones }, managedBusiness: { status: "ACTIVE" } },
    select: { managedBusiness: { select: { locations: { where: onShared, orderBy: { createdAt: "asc" }, take: 1, include: { business: true } } } } },
  });
  const managerLoc = manager?.managedBusiness?.locations[0];
  if (managerLoc) return { location: managerLoc, owner: true };

  const lastOut = await prisma.message.findFirst({
    where: { channel: "WHATSAPP", direction: "OUTBOUND", customer: { phone: from }, location: onShared },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, location: { include: { business: true } } },
  });
  if (lastOut) return { location: lastOut.location, owner: false };

  const known = await prisma.customer.findFirst({
    where: { phone: from, location: onShared, business: { country: { in: countries } } },
    orderBy: { lastSeenAt: "desc" },
    select: { location: { include: { business: true } } },
  });
  return known ? { location: known.location, owner: false } : null;
}

// POST — inbound WhatsApp events:
//  - delivery receipts (sent / delivered / read / failed) update our messages
//  - a business owner's reply to the morning brief ("1 3", "ALL", "SKIP")
//  - customer messages: passive data capture + the two-way inbox
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");

  if (!(await verifyWebhookSignature(rawBody, signature))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: WhatsAppWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await logEvent({ source: "WEBHOOK", level: "ERROR", message: "Received invalid JSON body" });
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const affectedBusinessIds = new Set<string>();
  const sharedId = process.env.WHATSAPP_SHARED_PHONE_NUMBER_ID;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { value } = change;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Delivery receipts for messages we sent.
      for (const st of value.statuses ?? []) {
        await handleWhatsAppStatus(st);
      }
      if (!value.messages?.length) continue;

      const ownLocation = await prisma.location.findUnique({
        where: { whatsappPhoneNumberId: phoneNumberId },
        include: { business: true },
      });
      const isShared = !ownLocation && !!sharedId && phoneNumberId === sharedId;
      if (!ownLocation && !isShared) {
        // Location hasn't finished setup yet — ack with 200 so Meta doesn't retry.
        if (META_SAMPLE_PHONE_NUMBER_IDS.includes(phoneNumberId)) {
          // Not a misconfiguration (bug B13): someone pressed "Test" in the Meta App Dashboard.
          await logEvent({ source: "WEBHOOK", level: "INFO", message: "Meta dashboard test event received (sample phone_number_id 123456123) — webhook is reachable" });
        } else {
          await logEvent({ source: "WEBHOOK", level: "WARN", message: `Webhook event for unrecognized phone_number_id ${phoneNumberId}`, meta: { hint: "Not the shared number (WHATSAPP_SHARED_PHONE_NUMBER_ID) and no location has this id in Settings." } });
        }
        continue;
      }

      const contactsByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const message of value.messages) {
        const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title;
        let location: LocWithBusiness | null = ownLocation;
        let fromOwner = false;
        if (isShared) {
          const routed = await routeShared(message.from, text);
          location = routed?.location ?? null;
          fromOwner = !!routed?.owner;
          if (!location) {
            await logEvent({ source: "WHATSAPP", level: "WARN", message: "Message on the shared number from someone no business has contacted (they must scan a business's QR first, so we know which business they mean)", meta: { from: message.from, text: text?.slice(0, 80) ?? null } });
            continue;
          }
        }
        if (!location) continue;
        const business = location.business;
        if (business.status === "SUSPENDED" || location.status === "SUSPENDED") continue;

        try {
          if (await handleInboundWhatsApp({ location, message, profileName: contactsByWaId.get(message.from) ?? null, fromOwner })) affectedBusinessIds.add(business.id);
        } catch (err) {
          await logEvent({
            businessId: business.id,
            source: "WEBHOOK",
            level: "ERROR",
            message: "Failed processing an inbound WhatsApp message",
            meta: { locationId: location.id, error: err instanceof Error ? err.message : String(err) },
          });
        }
      }
    }
  }

  for (const businessId of affectedBusinessIds) {
    await runSegmentationForBusiness(businessId);
  }

  return NextResponse.json({ received: true });
}
