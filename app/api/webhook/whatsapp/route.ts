import { NextRequest, NextResponse } from "next/server";
import type { Business, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyMessageType, isOptOutMessage, isQualifyingVisit, verifyWebhookSignature, WhatsAppWebhookPayload } from "@/lib/whatsapp";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { logEvent } from "@/lib/logger";
import { handleOwnerReply } from "@/lib/growth/brief";
import { sendOwnerSms, senderName } from "@/lib/sms";
import { canSendWhatsApp, sendOwnerWhatsApp } from "@/lib/whatsapp-send";
import { sharedCountries } from "@/lib/whatsapp-sender";

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

type LocWithBusiness = Location & { business: Business };

const STATUS: Record<string, string> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };

/**
 * Inbound on the shared number (+91 90414 36801): many businesses send from
 * it, so work out which one this person is talking to.
 *  1. the owner of a business on the shared number (brief replies)
 *  2. the business that last messaged this customer from the shared number
 *  3. the shared-number business this phone is already a customer of
 */
async function routeShared(from: string): Promise<{ location: LocWithBusiness; owner: boolean } | null> {
  const countries = sharedCountries();
  const phones = [from, `+${from}`];
  const onShared = { whatsappPhoneNumberId: null } as const;

  const settings = await prisma.growthSettings.findFirst({
    where: { ownerPhone: { in: phones }, business: { country: { in: countries } } },
    include: { business: { include: { locations: { where: onShared, orderBy: { createdAt: "asc" }, take: 1 } } } },
  });
  const ownerLoc = settings?.business.locations[0]
    ?? (await prisma.location.findFirst({ where: { ...onShared, ownerNotifyPhone: { in: phones }, business: { country: { in: countries } } } }));
  if (ownerLoc) {
    const location = await prisma.location.findUnique({ where: { id: ownerLoc.id }, include: { business: true } });
    if (location) return { location, owner: true };
  }

  const lastOut = await prisma.message.findFirst({
    where: { channel: "WHATSAPP", direction: "OUTBOUND", customer: { phone: from }, location: onShared },
    orderBy: { createdAt: "desc" },
    select: { location: { include: { business: true } } },
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
        const status = STATUS[st.status];
        if (!status) continue;
        await prisma.message.updateMany({ where: { providerSid: st.id, channel: "WHATSAPP", direction: "OUTBOUND" }, data: { status } });
        if (status === "FAILED") {
          await logEvent({ source: "WHATSAPP", level: "WARN", message: "WhatsApp message failed to deliver", meta: { id: st.id, errors: st.errors } });
        }
      }
      if (!value.messages?.length) continue;

      const ownLocation = await prisma.location.findUnique({
        where: { whatsappPhoneNumberId: phoneNumberId },
        include: { business: true },
      });
      const isShared = !ownLocation && !!sharedId && phoneNumberId === sharedId;
      if (!ownLocation && !isShared) {
        // Location hasn't finished setup yet — ack with 200 so Meta doesn't retry.
        await logEvent({ source: "WEBHOOK", level: "WARN", message: `Webhook event for unrecognized phone_number_id ${phoneNumberId}` });
        continue;
      }

      const contactsByWaId = new Map((value.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));

      for (const message of value.messages) {
        const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title;
        let location: LocWithBusiness | null = ownLocation;
        let fromOwner = false;
        if (isShared) {
          const routed = await routeShared(message.from);
          location = routed?.location ?? null;
          fromOwner = !!routed?.owner;
          if (!location) {
            await logEvent({ source: "WHATSAPP", level: "WARN", message: "Message on the shared number from someone no business has contacted", meta: { from: message.from } });
            continue;
          }
        }
        if (!location) continue;
        const business = location.business;
        if (business.status === "SUSPENDED" || location.status === "SUSPENDED") continue;

        try {
          // The owner answering the daily brief.
          if (text && (await handleOwnerReply(location, message.from, text).catch(() => false))) continue;
          if (fromOwner) continue; // owner chatting to the shared number, not a customer

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
              preferredChannel: "WHATSAPP", // they reached us on WhatsApp
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

          const stored = await prisma.message.create({
            data: {
              businessId: business.id,
              locationId: location.id,
              customerId: customer.id,
              direction: "INBOUND",
              channel: "WHATSAPP",
              purpose: "REPLY",
              status: "RECEIVED",
              providerSid: message.id,
              type: messageType,
              text: text ?? (message.type !== "text" ? `[${message.type}]` : null),
              readAt: optOut ? now : null,
              rawPayload: JSON.stringify(message),
            },
          }).catch((err) => {
            if (String(err?.code) === "P2002") return null; // Meta retried this event — already stored
            throw err;
          });
          if (!stored) continue;

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

          // Tell the owner (opt-in: Settings → "Forward customer replies to").
          if (!optOut && location.ownerNotifyPhone) {
            const who = customer.name ? `${customer.name} (+${customer.phone})` : `+${customer.phone}`;
            const name = senderName(location, business);
            if (business.defaultChannel === "WHATSAPP" && canSendWhatsApp(business, location)) {
              await sendOwnerWhatsApp(business, location, location.ownerNotifyPhone, {
                templateKey: "owner_new_message", params: [name, who, text ?? `[${message.type}]`],
              });
            } else {
              await sendOwnerSms(business, location, `${name} inbox — ${who}: ${text ?? `[${message.type}]`}`);
            }
          }

          affectedBusinessIds.add(business.id);
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
