import type { Business, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyMessageType, isOptOutMessage, isQualifyingVisit, type WhatsAppWebhookPayload } from "@/lib/whatsapp";
import { logEvent } from "@/lib/logger";
import { handleOwnerReply } from "@/lib/growth/brief";
import { sendOwnerSms, senderName, smsConfigured } from "@/lib/sms";
import { ownerWhatsAppSender, sendCustomerWhatsApp, sendOwnerWhatsApp } from "@/lib/whatsapp-send";
import { waErrorText } from "@/lib/whatsapp-sender";
import { onMessageDeliveryFailed } from "@/lib/growth/delivery";
import { handleStaffMessage, OWNER_NOT_INBOX } from "@/lib/staff";
import { applyConsentReply, applyJoin, consentAnswerText, parseConsentReply, parseJoin, welcomeText } from "@/lib/onboarding";
import { hubSetOptIn } from "@/lib/whatsapp-hub";

/**
 * What happens with one incoming WhatsApp message / one delivery receipt.
 * Used by Meta's webhook (app/api/webhook/whatsapp) and by messages Loopdesk
 * AI passes on for bundle clients (app/api/hub/whatsapp/inbound), so both
 * behave exactly the same.
 */

type Payload = NonNullable<NonNullable<NonNullable<WhatsAppWebhookPayload["entry"]>[number]["changes"]>[number]["value"]>;
export type WaInboundMessage = NonNullable<Payload["messages"]>[number];
export type WaStatus = NonNullable<Payload["statuses"]>[number];
export type LocWithBusiness = Location & { business: Business };

/** What Loopdesk AI forwards: Meta's message object (+ profileName), or the short { from, text, id }. */
export type HubInboundMessage = Record<string, unknown> & { from?: unknown; id?: unknown; type?: unknown; text?: unknown; profileName?: string | null };

/** A message from Loopdesk → Meta's shape (pure, unit-tested). null = not a message. */
export function toWaMessage(m: HubInboundMessage | null | undefined): WaInboundMessage | null {
  if (!m || typeof m.from !== "string" || typeof m.id !== "string") return null;
  const timestamp = typeof m.timestamp === "string" ? m.timestamp : String(Math.floor(Date.now() / 1000));
  if (typeof m.text === "string") return { from: m.from, id: m.id, timestamp, type: "text", text: { body: m.text } };
  const { profileName: _drop, ...rest } = m;
  void _drop;
  return { ...(rest as unknown as WaInboundMessage), timestamp, type: typeof m.type === "string" ? m.type : "text" };
}

const STATUS: Record<string, string> = { sent: "SENT", delivered: "DELIVERED", read: "READ", failed: "FAILED" };
/**
 * Meta can deliver receipts out of order (a late "sent" after "delivered").
 * A status only moves forward; FAILED is final.
 */
const RANK: Record<string, number> = { SENT: 1, DELIVERED: 2, READ: 3, FAILED: 9 };
const lowerThan = (status: string) => Object.keys(RANK).filter((k) => RANK[k] < RANK[status] && k !== "FAILED");

/** A delivery receipt for a message we sent. */
export async function handleWhatsAppStatus(st: WaStatus): Promise<void> {
  const status = STATUS[st.status];
  if (!status) return;
  await prisma.message.updateMany({
    where: { providerSid: st.id, channel: "WHATSAPP", direction: "OUTBOUND", status: { in: [...lowerThan(status), "QUEUED", "SENDING"] } },
    data: { status },
  });
  if (status === "FAILED") {
    // Keep Meta's reason on the message so the inbox can show it (e.g. 131049).
    const err = st.errors?.[0];
    const msg = await prisma.message.findFirst({ where: { providerSid: st.id, channel: "WHATSAPP", direction: "OUTBOUND" }, select: { id: true, businessId: true, rawPayload: true } });
    if (msg) {
      let raw: Record<string, unknown> = {};
      try { raw = msg.rawPayload ? JSON.parse(msg.rawPayload) : {}; } catch { /* keep empty */ }
      await prisma.message.update({ where: { id: msg.id }, data: { rawPayload: JSON.stringify({ ...raw, deliveryError: { code: err?.code ?? null, title: err?.title ?? null } }) } });
      // The Growth AI page must show "Failed", not "Done" (bug B1); 131049 is retried once tomorrow (bug B4).
      await onMessageDeliveryFailed({ messageId: msg.id, code: err?.code ?? null, reason: waErrorText(err?.code, err?.title) });
    }
    await logEvent({ businessId: msg?.businessId, source: "WHATSAPP", level: "WARN", message: `WhatsApp message failed to deliver${err?.code ? ` (Meta ${err.code})` : ""}`, meta: { id: st.id, errors: st.errors } });
  }
}

/**
 * One customer / owner message. Returns true when it was stored (the caller
 * re-runs segmentation for the business), false when it was handled or skipped.
 */
export async function handleInboundWhatsApp(p: { location: LocWithBusiness; message: WaInboundMessage; profileName: string | null; fromOwner: boolean; hubJoin?: boolean }): Promise<boolean> {
  const { location, message, fromOwner } = p;
  const business = location.business;
  const text = message.text?.body ?? message.button?.text ?? message.interactive?.button_reply?.title;
  const contactsByWaId = new Map<string, string | null>([[message.from, p.profileName]]);
  // A QR scan ("JOIN <code>" for this location) is always a customer
  // joining, even from the owner's or a manager's own phone while
  // testing (bugs 4 + 5, 27 Nov 2026).
  const qrJoin = parseJoin(text);
  // hubJoin: Loopdesk AI already matched this JOIN code to this business (A3,
  // 28 Nov 2026) — e.g. a Regulars QR printed before the codes were unified.
  const joining = !!qrJoin && (location.joinCode === qrJoin.code || p.hubJoin === true);

  // The owner approving an offer / a manager adding a customer.
  if (text && !joining && (await handleStaffMessage(location, message.from, text, "WHATSAPP").catch(async (err) => {
    await logEvent({ businessId: business.id, source: "WHATSAPP", level: "ERROR", message: "Staff command failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return false;
  }))) return false;
  // The owner answering the daily brief.
  if (text && !joining && (await handleOwnerReply(location, message.from, text).catch(() => false))) return false;
  if (fromOwner && !joining) {
    // The owner chatting to the shared number is not a customer, so it
    // never shows in the inbox. Say so, instead of going quiet (bug 6).
    await sendOwnerWhatsApp(business, location, message.from, { text: OWNER_NOT_INBOX }).catch(() => false);
    return false;
  }

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
      consentSource: "INBOUND", // they wrote first (consentStatus IMPLIED)
      optedOut: optOut,
      optedOutAt: optOut ? now : null,
    },
    update: {
      // Never overwrite the name the business saved with the
      // WhatsApp profile name ("AK" became "arpansaini", bug B18).
      // The profile name only fills an empty name, below.
      lastSeenAt: now,
      ...(isQualifyingVisit(messageType) ? { visitCount: { increment: 1 } } : {}),
      // Opt-outs are one-directional here: once set, only the
      // business owner can undo it via Settings, not a later
      // inbound message.
      ...(optOut ? { optedOut: true, optedOutAt: now } : {}),
    },
  });

  // Bundle client: the same STOP list in Loopdesk, so no other tool writes to them either.
  if (optOut && business.hubBusinessId) await hubSetOptIn(business.hubBusinessId, message.from, false);

  const profileName = contactsByWaId.get(message.from)?.trim();
  if (!customer.name && profileName) {
    await prisma.customer.update({ where: { id: customer.id }, data: { name: profileName } });
    customer.name = profileName;
  }

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
  if (!stored) return false;

  // QR scan ("JOIN <code>") or an answer to the YES/NO consent request:
  // handled automatically — a thank-you goes back, the owner isn't pinged.
  let automatic = false;
  const decision = !optOut && customer.consentStatus === "PENDING" ? parseConsentReply(text) : null;
  if (joining && qrJoin) {
    const joined = await applyJoin(customer, qrJoin.tag, now);
    await sendCustomerWhatsApp({ business, location, customer: joined, purpose: "OTHER", text: await welcomeText(business, senderName(location, business)), now });
    automatic = true;
  } else if (decision) {
    const answered = await applyConsentReply(customer, decision, now);
    await sendCustomerWhatsApp({ business, location, customer: answered, purpose: "OTHER", text: await consentAnswerText(business, senderName(location, business), decision), now });
    automatic = true;
  }
  if (automatic) await prisma.message.update({ where: { id: stored.id }, data: { readAt: now } });

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
  if (!optOut && !automatic && location.ownerNotifyPhone) {
    const who = customer.name ? `${customer.name} (+${customer.phone})` : `+${customer.phone}`;
    const name = senderName(location, business);
    // WhatsApp whenever we can reach the owner there (the shared number works for
    // owners in any country), SMS only when that's what's set up.
    const smsReady = !!location.smsFromNumber && smsConfigured();
    if (ownerWhatsAppSender(location, business) && !(business.defaultChannel === "SMS" && smsReady)) {
      await sendOwnerWhatsApp(business, location, location.ownerNotifyPhone, {
        templateKey: "owner_new_message", params: [name, who, text ?? `[${message.type}]`],
      });
    } else {
      await sendOwnerSms(business, location, `${name} inbox — ${who}: ${text ?? `[${message.type}]`}`);
    }
  }

  return true;
}
