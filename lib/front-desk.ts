import type { Business, Customer, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { sendCustomerSms, type SendResult } from "@/lib/sms";
import type { MessagePurpose } from "@/lib/types";

/**
 * WayneRing AI Front Desk — the "Return" half of the product loop:
 *   Recovered: missed call → booking-link SMS within a minute
 *   Reviewed:  after a visit → Google review request SMS
 *   Returned:  at-risk / dormant customers → win-back SMS (or WhatsApp)
 *
 * Every send goes through lib/sms.ts, which adds the sender name and STOP
 * footer and refuses opted-out customers.
 */

const DAY = 24 * 60 * 60 * 1000;
export const MISSED_CALL_DEDUPE_MS = 12 * 60 * 60 * 1000;   // one text-back per caller per 12h
export const REVIEW_REQUEST_EVERY_MS = 90 * DAY;             // don't ask the same person again for 90 days
export const WINBACK_EVERY_MS = 30 * DAY;                    // at most one win-back a month per customer

const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "";

export const TEMPLATES = {
  missedCall: (c: Customer, l: Location) =>
    l.bookingUrl
      ? `Sorry we missed your call${firstName(c.name) ? `, ${firstName(c.name)}` : ""}! You can book here: ${l.bookingUrl} or reply to this text and we'll get back to you.`
      : `Sorry we missed your call${firstName(c.name) ? `, ${firstName(c.name)}` : ""}! Reply to this text with what you need and we'll get right back to you.`,
  reviewRequest: (c: Customer, l: Location) =>
    `Thanks for choosing us${firstName(c.name) ? `, ${firstName(c.name)}` : ""}! If we did a good job, would you leave us a quick Google review? ${l.googleReviewUrl}`,
  winback: (c: Customer, l: Location) => {
    const hi = firstName(c.name) ? `Hi ${firstName(c.name)}, ` : "Hi, ";
    const book = l.bookingUrl ? ` Book here: ${l.bookingUrl}` : " Reply to this text to book.";
    return c.segment === "DORMANT"
      ? `${hi}it's been a while and we'd love to see you again.${book}`
      : `${hi}just checking in — it's about time for your next visit.${book}`;
  },
};

/** WhatsApp template send (business-initiated messages need an approved template). */
async function sendWhatsAppTemplate(business: Business, location: Location, customer: Customer, purpose: MessagePurpose, vars: string[]) {
  const template = purpose === "WINBACK" ? process.env.WHATSAPP_TEMPLATE_WINBACK : purpose === "REVIEW_REQUEST" ? process.env.WHATSAPP_TEMPLATE_REVIEW : undefined;
  if (!template || !location.whatsappPhoneNumberId || !location.whatsappAccessToken) return null; // not set up → caller falls back to SMS
  if (customer.optedOut) return { ok: false, status: "OPTED_OUT" } as SendResult;
  const res = await fetch(`https://graph.facebook.com/v21.0/${location.whatsappPhoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${location.whatsappAccessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: customer.phone, type: "template",
      template: { name: template, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || "en" },
        components: [{ type: "body", parameters: vars.map((text) => ({ type: "text", text })) }] },
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  const ok = res.ok && !!data.messages?.[0]?.id;
  await prisma.message.create({
    data: { businessId: business.id, locationId: location.id, customerId: customer.id, direction: "OUTBOUND", channel: "WHATSAPP",
            purpose, status: ok ? "SENT" : "FAILED", providerSid: data.messages?.[0]?.id ?? null, text: `[template ${template}] ${vars.join(" | ")}` },
  });
  if (!ok) await logEvent({ businessId: business.id, source: "SMS", level: "ERROR", message: "WhatsApp template send failed", meta: { error: data.error?.message } });
  return (ok ? { ok: true, status: "SENT", segments: 0 } : { ok: false, status: "FAILED", error: data.error?.message }) as SendResult;
}

/** Customer's channel: their own preference, else the business default. WhatsApp falls back to SMS when not set up. */
async function sendToCustomer(business: Business, location: Location, customer: Customer, purpose: MessagePurpose, body: string, waVars: string[]) {
  const channel = customer.preferredChannel ?? business.defaultChannel;
  if (channel === "WHATSAPP") {
    const r = await sendWhatsAppTemplate(business, location, customer, purpose, waVars);
    if (r) return r;
  }
  return sendCustomerSms({ business, location, customer, body, purpose });
}

/** Finds or creates the customer for a phone at a location. */
export async function upsertCustomer(business: Business, location: Location, phone: string, name?: string | null) {
  return prisma.customer.upsert({
    where: { locationId_phone: { locationId: location.id, phone } },
    create: { businessId: business.id, locationId: location.id, phone, name: name ?? null },
    update: name ? { name } : {},
  });
}

export async function textBackMissedCall(business: Business, location: Location, customer: Customer, now = new Date()) {
  if (customer.lastMissedCallTextAt && now.getTime() - customer.lastMissedCallTextAt.getTime() < MISSED_CALL_DEDUPE_MS) {
    return { ok: false as const, status: "DUPLICATE" as const };
  }
  // A missed call is a reply to the customer's own call: always SMS (it can't wait for template approval).
  const r = await sendCustomerSms({ business, location, customer, body: TEMPLATES.missedCall(customer, location), purpose: "MISSED_CALL" });
  if (r.ok) await prisma.customer.update({ where: { id: customer.id }, data: { lastMissedCallTextAt: now } });
  return r;
}

export async function sendReviewRequest(business: Business, location: Location, customer: Customer, now = new Date()) {
  if (!location.googleReviewUrl) return { ok: false as const, status: "NO_REVIEW_LINK" as const };
  if (customer.lastReviewRequestAt && now.getTime() - customer.lastReviewRequestAt.getTime() < REVIEW_REQUEST_EVERY_MS) {
    return { ok: false as const, status: "RECENTLY_ASKED" as const };
  }
  const r = await sendToCustomer(business, location, customer, "REVIEW_REQUEST", TEMPLATES.reviewRequest(customer, location),
                                 [firstName(customer.name) || "there", location.googleReviewUrl]);
  if (r.ok) await prisma.customer.update({ where: { id: customer.id }, data: { lastReviewRequestAt: now } });
  return r;
}

/**
 * Win-back for AT_RISK and DORMANT customers. dryRun returns who would be
 * messaged without sending. Capped per run so one click can't blow the SMS budget.
 */
export async function runWinback(business: Business, opts: { dryRun?: boolean; limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const eligible = await prisma.customer.findMany({
    where: {
      businessId: business.id,
      segment: { in: ["AT_RISK", "DORMANT"] },
      optedOut: false,
      smsOptedOut: false,
      OR: [{ lastWinbackAt: null }, { lastWinbackAt: { lt: new Date(now.getTime() - WINBACK_EVERY_MS) } }],
    },
    include: { location: true },
    orderBy: { lastSeenAt: "desc" },
    take: Math.min(opts.limit ?? 200, 500),
  });
  if (opts.dryRun) return { eligible: eligible.length, sent: 0, failed: 0, dryRun: true };
  let sent = 0, failed = 0;
  for (const c of eligible) {
    const r = await sendToCustomer(business, c.location, c, "WINBACK", TEMPLATES.winback(c, c.location),
                                   [firstName(c.name) || "there", c.location.bookingUrl ?? ""]);
    if (r.ok) { sent++; await prisma.customer.update({ where: { id: c.id }, data: { lastWinbackAt: now } }); }
    else failed++;
  }
  await logEvent({ businessId: business.id, source: "SMS", level: "INFO", message: `Win-back run: ${sent} sent, ${failed} not sent`, meta: { eligible: eligible.length } });
  return { eligible: eligible.length, sent, failed, dryRun: false };
}
