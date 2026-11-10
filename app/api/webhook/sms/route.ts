import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";
import { keywordOf, sendOwnerSms, signedUrl, verifyTwilioSignature } from "@/lib/sms";
import { handleOwnerReply } from "@/lib/growth/brief";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () => new NextResponse(EMPTY_TWIML, { status: 200, headers: { "content-type": "text/xml" } });

/**
 * POST /api/webhook/sms — inbound SMS from Twilio (set as the texting number's
 * "A message comes in" webhook). Builds the two-way inbox:
 *  - matches the location by the number that was texted (To)
 *  - STOP / START keywords flip the customer's SMS opt-out
 *  - every other message lands in /dashboard/inbox (unread) and is forwarded
 *    to the owner's phone when ownerNotifyPhone is set
 * Twilio itself replies to STOP/START/HELP on Canadian long codes (Advanced
 * Opt-Out), so we don't send our own confirmation and risk a double reply.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
  if (!verifyTwilioSignature(signedUrl(req), params, req.headers.get("x-twilio-signature"))) {
    return new NextResponse("Invalid signature", { status: 403 });
  }

  const to = params.To, body = params.Body ?? "";
  const location = to ? await prisma.location.findUnique({ where: { smsFromNumber: to }, include: { business: true } }) : null;
  if (!location) {
    await logEvent({ source: "SMS", level: "WARN", message: `Inbound SMS to unknown number ${to}` });
    return twiml();
  }
  const business = location.business;
  if (business.status === "SUSPENDED" || location.status === "SUSPENDED") return twiml();

  const phone = normalizePhone(params.From, business.country);
  if (!phone) return twiml();

  // AI Growth Manager: the owner answering the daily brief ("1 3", "ALL", "SKIP").
  if (await handleOwnerReply(location, params.From, body).catch(() => false)) return twiml();

  const kw = keywordOf(body);
  const now = new Date();
  const customer = await prisma.customer.upsert({
    where: { locationId_phone: { locationId: location.id, phone } },
    create: {
      businessId: business.id, locationId: location.id, phone,
      preferredChannel: "SMS",
      smsOptedOut: kw === "STOP", smsOptedOutAt: kw === "STOP" ? now : null,
    },
    update: {
      lastSeenAt: now,
      ...(kw === "STOP" ? { smsOptedOut: true, smsOptedOutAt: now } : {}),
      ...(kw === "START" ? { smsOptedOut: false, smsOptedOutAt: null } : {}),
    },
  });

  await prisma.message.create({
    data: {
      businessId: business.id, locationId: location.id, customerId: customer.id,
      direction: "INBOUND", channel: "SMS", purpose: "REPLY", status: "RECEIVED",
      providerSid: params.MessageSid || null, text: body,
      // Keywords are handled automatically — don't make the owner read them.
      readAt: kw ? now : null,
      rawPayload: JSON.stringify({ From: params.From, To: to, NumMedia: params.NumMedia }),
    },
  }).catch(async (err) => {
    // A retried webhook (same MessageSid) — already stored.
    if (String(err?.code) !== "P2002") throw err;
  });

  if (kw) {
    await logEvent({ businessId: business.id, source: "SMS", level: "INFO", message: `SMS ${kw} from ${phone}`, meta: { customerId: customer.id } });
  } else if (location.ownerNotifyPhone) {
    const who = customer.name ? `${customer.name} (+${phone})` : `+${phone}`;
    await sendOwnerSms(business, location, `${location.smsSenderName || business.name} inbox — ${who}: ${body}`);
  }
  return twiml();
}
