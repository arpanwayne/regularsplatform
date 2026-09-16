import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { classifyMessageType, isOptOutMessage, isQualifyingVisit, verifyWebhookSignature, WhatsAppWebhookPayload } from "@/lib/whatsapp";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { logEvent } from "@/lib/logger";

// GET — Meta's webhook verification handshake. Each Location gets its own
// whatsappVerifyToken (shown on the Settings page); we also accept the
// global WHATSAPP_WEBHOOK_VERIFY_TOKEN for a first-time setup before any
// location has configured its own.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !token || !challenge) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  if (token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  const location = await prisma.location.findFirst({ where: { whatsappVerifyToken: token } });
  if (location) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// POST — inbound WhatsApp events. This is the "passive data capture" path:
// every customer message that lands here silently builds/updates that
// customer's profile, with zero setup from the business owner beyond
// pointing that location's WABA webhook at this URL. A phone number ID
// belongs to exactly one Location (each location connects its own WhatsApp
// number), and a Location belongs to exactly one Business.
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

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const { value } = change;
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId || !value.messages?.length) continue;

      const location = await prisma.location.findUnique({
        where: { whatsappPhoneNumberId: phoneNumberId },
        include: { business: true },
      });
      // Unrecognized phone_number_id (e.g. location hasn't finished setup
      // yet) — ack with 200 so Meta doesn't retry, but do nothing.
      if (!location) {
        await logEvent({
          source: "WEBHOOK",
          level: "WARN",
          message: `Webhook event for unrecognized phone_number_id ${phoneNumberId}`,
        });
        continue;
      }
      const business = location.business;
      // Suspended at either level (super admin suspends the whole
      // business, or the owner/admin suspends just this location) — stop
      // ingesting without erroring the webhook itself.
      if (business.status === "SUSPENDED" || location.status === "SUSPENDED") continue;

      const contactsByWaId = new Map(
        (value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name])
      );

      try {
        for (const message of value.messages) {
          const text = message.text?.body;
          const messageType = classifyMessageType(text);
          const optOut = isOptOutMessage(text);
          const now = new Date();

          const customer = await prisma.customer.upsert({
            where: { locationId_phone: { locationId: location.id, phone: message.from } },
            create: {
              businessId: business.id,
              locationId: location.id,
              phone: message.from,
              name: contactsByWaId.get(message.from) ?? null,
              firstSeenAt: now,
              lastSeenAt: now,
              visitCount: isQualifyingVisit(messageType) ? 1 : 0,
              optedOut: optOut,
              optedOutAt: optOut ? now : null,
            },
            update: {
              name: contactsByWaId.get(message.from) ?? undefined,
              lastSeenAt: now,
              ...(isQualifyingVisit(messageType) ? { visitCount: { increment: 1 } } : {}),
              // Opt-outs are one-directional here: once set, only the
              // business owner can undo it via Settings, not a later
              // inbound message.
              ...(optOut ? { optedOut: true, optedOutAt: now } : {}),
            },
          });

          await prisma.message.create({
            data: {
              businessId: business.id,
              locationId: location.id,
              customerId: customer.id,
              direction: "INBOUND",
              type: messageType,
              text: text ?? null,
              rawPayload: JSON.stringify(message),
            },
          });

          if (isQualifyingVisit(messageType)) {
            await prisma.visit.create({
              data: {
                businessId: business.id,
                locationId: location.id,
                customerId: customer.id,
                occurredAt: now,
                source: `whatsapp:${messageType.toLowerCase()}`,
              },
            });
          }

          affectedBusinessIds.add(business.id);
        }
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

  for (const businessId of affectedBusinessIds) {
    await runSegmentationForBusiness(businessId);
  }

  return NextResponse.json({ received: true });
}
