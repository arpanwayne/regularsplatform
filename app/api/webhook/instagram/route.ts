import { NextRequest, NextResponse } from "next/server";
import type { Business, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { sendOwnerSms, senderName, smsConfigured } from "@/lib/sms";
import { businessLanguage, ownerWhatsAppSender, sendOwnerWhatsApp } from "@/lib/whatsapp-send";
import {
  BOOKING_REPLY_EVERY_MS, bookingReply, customerLabel, dmText, fetchInstagramUsername, igPhone,
  instagramAllowed, isBookingIntent, sendCustomerInstagram, verifyInstagramSignature,
  type InstagramMessagingEvent, type InstagramWebhookPayload,
} from "@/lib/instagram";

/**
 * Instagram DMs → booking (Loopdesk add-on). Meta App Dashboard →
 * Instagram → Webhooks: Callback URL = <site>/api/webhook/instagram,
 * Verify token = INSTAGRAM_WEBHOOK_VERIFY_TOKEN, subscribe to "messages".
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode !== "subscribe" || !token || !challenge) return new NextResponse("Bad Request", { status: 400 });
  const expected = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (expected && token === expected) return new NextResponse(challenge, { status: 200 });
  return new NextResponse("Forbidden", { status: 403 });
}

type LocWithBusiness = Location & { business: Business };

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!(await verifyInstagramSignature(rawBody, req.headers.get("x-hub-signature-256")))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }
  let payload: InstagramWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    await logEvent({ source: "WEBHOOK", level: "ERROR", message: "Instagram webhook: invalid JSON body" });
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  for (const entry of payload.entry ?? []) {
    const location = await prisma.location.findUnique({ where: { instagramAccountId: entry.id }, include: { business: true } });
    if (!location) {
      await logEvent({ source: "WEBHOOK", level: "WARN", message: `Instagram event for an account no location has connected (${entry.id})`, meta: { hint: "Settings → Instagram account ID must match the professional account that received the DM." } });
      continue;
    }
    const business = location.business;
    if (business.status === "SUSPENDED" || location.status === "SUSPENDED") continue;
    if (!instagramAllowed(business)) {
      await logEvent({ businessId: business.id, source: "INSTAGRAM", level: "WARN", message: "Instagram DM received but the Instagram add-on is off for this business (Admin → Businesses)" });
      continue;
    }
    for (const ev of entry.messaging ?? []) {
      try {
        await handleEvent(location, ev);
      } catch (err) {
        await logEvent({ businessId: business.id, source: "INSTAGRAM", level: "ERROR", message: "Failed processing an Instagram DM", meta: { locationId: location.id, error: err instanceof Error ? err.message : String(err) } });
      }
    }
  }
  // Always 200 for handled payloads, so Meta doesn't retry and disable the webhook.
  return NextResponse.json({ received: true });
}

async function handleEvent(location: LocWithBusiness, ev: InstagramMessagingEvent) {
  const m = ev.message;
  if (!m?.mid || m.is_deleted) return;
  const business = location.business;
  const text = dmText(m);

  // The owner replied from the Instagram app itself: keep it in the thread.
  if (m.is_echo) {
    const customer = await prisma.customer.findFirst({ where: { locationId: location.id, instagramId: ev.recipient.id } });
    if (!customer) return;
    await prisma.message.create({
      data: { businessId: business.id, locationId: location.id, customerId: customer.id, direction: "OUTBOUND", channel: "INSTAGRAM", purpose: "REPLY", status: "SENT", providerSid: m.mid, text },
    }).catch((err) => { if (String(err?.code) !== "P2002") throw err; }); // our own send, already stored
    return;
  }

  const igsid = ev.sender.id;
  const now = new Date();
  let customer = await prisma.customer.findFirst({ where: { locationId: location.id, instagramId: igsid } });
  if (!customer) {
    const username = await fetchInstagramUsername(location, igsid);
    customer = await prisma.customer.upsert({
      where: { locationId_phone: { locationId: location.id, phone: igPhone(igsid) } },
      create: { businessId: business.id, locationId: location.id, phone: igPhone(igsid), instagramId: igsid, instagramUsername: username, firstSeenAt: now, lastSeenAt: now },
      update: { instagramId: igsid, lastSeenAt: now },
    });
  } else {
    customer = await prisma.customer.update({ where: { id: customer.id }, data: { lastSeenAt: now } });
  }

  const stored = await prisma.message.create({
    data: {
      businessId: business.id, locationId: location.id, customerId: customer.id,
      direction: "INBOUND", channel: "INSTAGRAM", purpose: "REPLY", status: "RECEIVED",
      providerSid: m.mid, text, rawPayload: JSON.stringify(ev),
    },
  }).catch((err) => {
    if (String(err?.code) === "P2002") return null; // Meta retried this event — already stored
    throw err;
  });
  if (!stored) return;

  // "Can I book?" → the booking link, at most once per person every 12 hours.
  let autoReplied = false;
  if (location.instagramAutoBooking && location.bookingUrl && isBookingIntent(text)) {
    const recent = await prisma.message.findFirst({
      where: { customerId: customer.id, channel: "INSTAGRAM", purpose: "BOOKING_LINK", createdAt: { gte: new Date(now.getTime() - BOOKING_REPLY_EVERY_MS) } },
      select: { id: true },
    });
    if (!recent) {
      const lang = await businessLanguage(business);
      const r = await sendCustomerInstagram({ business, location, customer, purpose: "BOOKING_LINK", text: bookingReply(lang, senderName(location, business), location.bookingUrl), now });
      autoReplied = r.ok;
    }
  }

  // Tell the owner, the same way as a WhatsApp/SMS customer message.
  if (location.ownerNotifyPhone) {
    const who = `${customerLabel(customer)} (Instagram)`;
    const body = `${text ?? "[message]"}${autoReplied ? " — booking link sent automatically" : ""}`;
    const name = senderName(location, business);
    const smsReady = !!location.smsFromNumber && smsConfigured();
    if (ownerWhatsAppSender(location, business) && !(business.defaultChannel === "SMS" && smsReady)) {
      await sendOwnerWhatsApp(business, location, location.ownerNotifyPhone, { templateKey: "owner_new_message", params: [name, who, body] });
    } else {
      await sendOwnerSms(business, location, `${name} inbox — ${who}: ${body}`);
    }
  }
}
