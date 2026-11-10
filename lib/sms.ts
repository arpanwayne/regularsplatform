import { createHmac, timingSafeEqual } from "crypto";
import type { Business, Customer, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { toE164 } from "@/lib/phone";
import type { MessagePurpose } from "@/lib/types";

/**
 * SMS channel (Twilio) — added for WayneRing AI Front Desk, where Canadian
 * customers text rather than use WhatsApp.
 *
 * Compliance (CASL + carrier rules), enforced here so no caller can skip it:
 *  - every customer SMS starts with the sender name ("Maple HVAC: ...")
 *  - every customer SMS ends with "Reply STOP to opt out"
 *  - STOP / START keywords are honoured (app/api/webhook/sms/route.ts)
 *  - nothing is sent to a customer who opted out (SMS or WhatsApp opt-out)
 *
 * Without TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN, sends run in dry-run mode:
 * the message is stored with status NOT_SENT so the flow can be demoed and
 * tested without a Twilio account.
 */

export const STOP_KEYWORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "arret", "arrêt"];
export const START_KEYWORDS = ["start", "unstop", "yes", "resume"];
export const HELP_KEYWORDS = ["help", "info", "aide"];

export function keywordOf(text: string | null | undefined): "STOP" | "START" | "HELP" | null {
  const t = (text ?? "").trim().toLowerCase().replace(/[.!]+$/, "");
  if (STOP_KEYWORDS.includes(t)) return "STOP";
  if (START_KEYWORDS.includes(t)) return "START";
  if (HELP_KEYWORDS.includes(t)) return "HELP";
  return null;
}

export function smsConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
}

export function senderName(location: Pick<Location, "smsSenderName" | "name">, business: Pick<Business, "name">) {
  return (location.smsSenderName || business.name || location.name).trim();
}

const OPT_OUT_FOOTER = "Reply STOP to opt out.";

/** Adds the sender prefix and opt-out footer to a customer-facing SMS. */
export function composeCustomerSms(sender: string, body: string) {
  let text = body.trim();
  if (!text.toLowerCase().startsWith(sender.toLowerCase())) text = `${sender}: ${text}`;
  if (!/reply stop/i.test(text)) text = `${text} ${OPT_OUT_FOOTER}`;
  return text;
}

// GSM-7 basic set (+ the common extension chars, which cost 2 but we keep it simple).
const GSM7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** Billable SMS segments: 160/153 chars (GSM-7) or 70/67 (anything else, e.g. emoji). */
export function countSegments(text: string) {
  const gsm = GSM7.test(text);
  const len = [...text].length;
  const single = gsm ? 160 : 70, multi = gsm ? 153 : 67;
  return len <= single ? 1 : Math.ceil(len / multi);
}

/** The URL Twilio signed: APP_URL + path when set (proxies rewrite req.url), else req.url. */
export function signedUrl(req: { url: string; nextUrl: { pathname: string; search: string } }) {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return base ? base + req.nextUrl.pathname + req.nextUrl.search : req.url;
}

/** Twilio request signature check (X-Twilio-Signature). */
export function verifyTwilioSignature(url: string, params: Record<string, string>, signature: string | null) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return true; // dry-run / local setup — same stance as the WhatsApp webhook
  if (!signature) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function twilioSend(from: string, to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const form = new URLSearchParams({ From: from, To: to, Body: body });
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (appUrl) form.set("StatusCallback", `${appUrl}/api/webhook/sms/status`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string; code?: number };
  if (!res.ok) throw new Error(`Twilio ${res.status}${data.code ? ` (${data.code})` : ""}: ${data.message ?? "send failed"}`);
  return { sid: data.sid ?? null, status: (data.status ?? "queued").toUpperCase() };
}

export type SendResult =
  | { ok: true; status: "QUEUED" | "SENT" | "NOT_SENT"; messageId?: string; segments: number }
  | { ok: false; status: "OPTED_OUT" | "NO_NUMBER" | "SUSPENDED" | "FAILED"; error?: string };

/**
 * Sends one SMS to a customer from their location's texting number, records
 * it in the conversation (Message) and in usage (UsageEvent SMS_SENT).
 */
export async function sendCustomerSms(params: {
  business: Business;
  location: Location;
  customer: Customer;
  body: string;
  purpose: MessagePurpose;
}): Promise<SendResult> {
  const { business, location, customer, purpose } = params;
  if (business.status === "SUSPENDED" || location.status === "SUSPENDED") return { ok: false, status: "SUSPENDED" };
  if (customer.optedOut || customer.smsOptedOut) return { ok: false, status: "OPTED_OUT" };
  if (!location.smsFromNumber) {
    await logEvent({ businessId: business.id, source: "SMS", level: "WARN", message: `No texting number on location "${location.name}" — SMS not sent`, meta: { purpose } });
    return { ok: false, status: "NO_NUMBER" };
  }

  const text = composeCustomerSms(senderName(location, business), params.body);
  const segments = countSegments(text);
  let providerSid: string | null = null;
  let status: "QUEUED" | "SENT" | "NOT_SENT" = "NOT_SENT";

  if (smsConfigured()) {
    try {
      const r = await twilioSend(location.smsFromNumber, toE164(customer.phone), text);
      providerSid = r.sid;
      status = r.status === "SENT" ? "SENT" : "QUEUED";
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await logEvent({ businessId: business.id, source: "SMS", level: "ERROR", message: "SMS send failed", meta: { customerId: customer.id, purpose, error } });
      await prisma.message.create({
        data: { businessId: business.id, locationId: location.id, customerId: customer.id, direction: "OUTBOUND", channel: "SMS", purpose, status: "FAILED", text },
      });
      return { ok: false, status: "FAILED", error };
    }
  }

  const msg = await prisma.message.create({
    data: {
      businessId: business.id, locationId: location.id, customerId: customer.id,
      direction: "OUTBOUND", channel: "SMS", purpose, status, providerSid, segments, text,
    },
  });
  if (status !== "NOT_SENT") {
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "SMS_SENT", smsSegments: segments } });
  }
  return { ok: true, status, messageId: msg.id, segments };
}

/** Plain SMS to the business owner (inbox forwards). Not a customer message: no footer, not in a conversation. */
export async function sendOwnerSms(business: Business, location: Location, body: string) {
  if (!location.ownerNotifyPhone || !location.smsFromNumber) return false;
  if (!smsConfigured()) return false;
  try {
    const text = body.length > 600 ? body.slice(0, 597) + "…" : body;
    await twilioSend(location.smsFromNumber, location.ownerNotifyPhone, text);
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "SMS_SENT", smsSegments: countSegments(text) } });
    return true;
  } catch (err) {
    await logEvent({ businessId: business.id, source: "SMS", level: "ERROR", message: "Owner forward SMS failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return false;
  }
}

/** SMS segments sent this calendar month (UTC) vs the business's included limit. */
export async function smsUsageThisMonth(business: Pick<Business, "id" | "smsMonthlyLimit" | "smsOverageRateCad">, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const agg = await prisma.usageEvent.aggregate({
    where: { businessId: business.id, type: "SMS_SENT", createdAt: { gte: start } },
    _sum: { smsSegments: true },
  });
  const used = agg._sum.smsSegments ?? 0;
  const limit = business.smsMonthlyLimit;
  const overage = limit == null ? 0 : Math.max(0, used - limit);
  return { used, limit, overage, overageCad: Math.round(overage * business.smsOverageRateCad * 100) / 100 };
}
