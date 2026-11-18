import type { Business, Customer, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { isPlaceholderPhone, normalizePhone, toE164 } from "@/lib/phone";
import { sendCustomerSms, senderName } from "@/lib/sms";
import { businessLanguage, sendCustomerWhatsApp } from "@/lib/whatsapp-send";
import { sharedDisplayNumber, whatsappSenderFor } from "@/lib/whatsapp-sender";
import { HAS_REAL_PHONE } from "@/lib/instagram-shared";
import { getSettings, withinContactHours } from "@/lib/growth/settings";
import type { SendResult } from "@/lib/sms";

/**
 * Customer onboarding (Nov 2026). A customer joins a business in one of these ways:
 *
 *   QR scan       The QR opens WhatsApp (or SMS in Canada) with "JOIN K7M2QX T5"
 *                 already typed. Sending it = they joined themselves → GRANTED.
 *                 The code also tells the shared WhatsApp number which business
 *                 it is for, so a first-time customer is routed correctly.
 *   Staff add     A manager/owner WhatsApps the business number "add Rahul 98…",
 *                 or adds them on Dashboard → Customers. The customer is PENDING
 *                 and gets one YES/NO request; YES → GRANTED, NO → DECLINED.
 *   Import        Dashboard CSV import: PENDING, requests go out from the hourly
 *                 cron in contact hours (unless the owner confirms the list has
 *                 already agreed → IMPLIED).
 *   Inbound       They wrote or called first → IMPLIED (unchanged behaviour).
 *
 * Nothing marketing goes to PENDING or DECLINED (lib/consent.ts).
 */

// ── Pure helpers (unit-tested) ────────────────────────────────────────────

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
export const JOIN_CODE_LENGTH = 6;

export function newJoinCode(random: () => number = Math.random) {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  return code;
}

/** "T5", "table 5" → "T5"-style tag for the QR text: letters, digits and dashes, max 20. */
export function cleanTag(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").toUpperCase().replace(/\s+/g, "").replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  return t || null;
}

/** What the QR pre-types: "JOIN K7M2QX" or "JOIN K7M2QX T5". */
export function joinText(code: string, tag?: string | null) {
  const t = cleanTag(tag);
  return `JOIN ${code}${t ? ` ${t}` : ""}`;
}

/** Finds "JOIN K7M2QX [TAG]" anywhere in a message (people sometimes add "hi"). */
export function parseJoin(text: string | null | undefined): { code: string; tag: string | null } | null {
  const m = String(text ?? "").match(/\bjoin\s+([a-z0-9]{6})\b(?:\s+([a-z0-9-]{1,20}))?/i);
  if (!m) return null;
  const code = m[1].toUpperCase();
  if (![...code].every((ch) => CODE_ALPHABET.includes(ch))) return null;
  return { code, tag: cleanTag(m[2]) };
}

export function whatsappJoinLink(displayNumber: string, code: string, tag?: string | null) {
  return `https://wa.me/${displayNumber.replace(/\D/g, "")}?text=${encodeURIComponent(joinText(code, tag))}`;
}

/** sms: link with the body pre-filled ("?&body=" works on both iPhone and Android). */
export function smsJoinLink(number: string, code: string, tag?: string | null) {
  return `sms:${toE164(number.replace(/[^\d+]/g, ""))}?&body=${encodeURIComponent(joinText(code, tag))}`;
}

const YES = /^(yes|y|yess|yes please|haan|haa|ha|han|haanji|haan ji|ji|ji haan|ok|okay|sure|join|start|हाँ|हां|ਹਾਂ|ਹਾਂਜੀ)$/;
const NO = /^(no|n|nope|nahi|nahin|nai|na|no thanks|नहीं|ਨਹੀਂ)$/;

/** Answer to the YES/NO consent request, or null if the message is something else. */
export function parseConsentReply(text: string | null | undefined): "GRANTED" | "DECLINED" | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[\s.!,🙏👍✅❌]+$/u, "").replace(/\s+/g, " ");
  if (YES.test(t)) return "GRANTED";
  if (NO.test(t)) return "DECLINED";
  return null;
}

/**
 * Staff command "add Rahul Sharma 98765 43210" (name and number in any order).
 * null = not an add command; { error } = looked like one but can't be used.
 */
export function parseStaffAdd(text: string | null | undefined, country = "IN"):
  | { name: string | null; phone: string }
  | { error: string }
  | null {
  const m = String(text ?? "").trim().replace(/\s+/g, " ").match(/^add (.+)$/i);
  if (!m) return null;
  const rest = m[1];
  const num = rest.match(/\+?\d[\d\s-]{6,16}\d/);
  if (!num) return { error: "No mobile number found. Send: add <name> <mobile>, e.g. add Rahul 9876543210" };
  const phone = normalizePhone(num[0], country);
  if (!phone || isPlaceholderPhone(phone)) return { error: `${num[0].trim()} doesn't look like a real mobile number.` };
  const name = rest.replace(num[0], " ").replace(/[,:;|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || null;
  return { name, phone };
}

// ── Database side ─────────────────────────────────────────────────────────

/** The location's join code, made on first use. */
export async function ensureJoinCode(location: Location): Promise<string> {
  if (location.joinCode) return location.joinCode;
  for (let i = 0; i < 6; i++) {
    const code = newJoinCode();
    try {
      await prisma.location.update({ where: { id: location.id }, data: { joinCode: code } });
      return code;
    } catch (err) {
      if (String((err as { code?: string })?.code) !== "P2002") throw err; // taken — try another
    }
  }
  throw new Error("Could not create a unique join code");
}

const GRAPH = `https://graph.facebook.com/${process.env.WHATSAPP_GRAPH_VERSION || "v21.0"}`;

/**
 * Which number the QR should open: the location's own WhatsApp number, the
 * shared WhatsApp number, or (businesses that text by SMS) the texting number.
 */
export async function qrTargetFor(location: Location, business: Business): Promise<{ kind: "WHATSAPP" | "SMS"; number: string } | null> {
  if (business.defaultChannel === "SMS" && location.smsFromNumber) return { kind: "SMS", number: location.smsFromNumber };
  const sender = whatsappSenderFor(location, business);
  if (sender?.shared) return { kind: "WHATSAPP", number: sharedDisplayNumber() };
  if (sender && location.whatsappDisplayNumber) return { kind: "WHATSAPP", number: location.whatsappDisplayNumber };
  if (sender) {
    // Own Meta number: we only store its id, so read the dialable number once.
    try {
      const res = await fetch(`${GRAPH}/${sender.phoneNumberId}?fields=display_phone_number`, { headers: { authorization: `Bearer ${sender.accessToken}` } });
      const data = (await res.json().catch(() => ({}))) as { display_phone_number?: string };
      if (res.ok && data.display_phone_number) {
        await prisma.location.update({ where: { id: location.id }, data: { whatsappDisplayNumber: data.display_phone_number } });
        return { kind: "WHATSAPP", number: data.display_phone_number };
      }
    } catch { /* fall through */ }
  }
  if (location.smsFromNumber) return { kind: "SMS", number: location.smsFromNumber };
  return null;
}

const firstName = (c: Pick<Customer, "name">) => (c.name ?? "").trim().split(/\s+/)[0] || "";

/**
 * Sends the one-time YES/NO request to a PENDING customer. Only marks it sent
 * when it really went out, so a failed or not-configured send is retried by
 * the hourly cron (processQueuedConsentRequests).
 */
export async function requestConsent(business: Business, location: Location, customer: Customer, now = new Date()): Promise<SendResult | null> {
  if (customer.consentStatus !== "PENDING" || customer.optedOut) return null;
  const name = senderName(location, business);
  const channel = customer.preferredChannel ?? business.defaultChannel;
  let r: SendResult | null = null;
  if (channel === "WHATSAPP") {
    const lang = await businessLanguage(business);
    const first = firstName(customer) || (lang === "en" ? "there" : "ji");
    r = await sendCustomerWhatsApp({ business, location, customer, purpose: "CONSENT_REQUEST", templateKey: "consent_request", params: [first, name], now });
  }
  if (!r) {
    r = await sendCustomerSms({
      business, location, customer, purpose: "CONSENT_REQUEST",
      body: `${name}: would you like offers and updates from us by text? Reply YES to join or NO if you don't want them.`,
    });
  }
  const sent = r.ok && r.status !== "NOT_SENT";
  if (sent) await prisma.customer.update({ where: { id: customer.id }, data: { consentRequestedAt: now } });
  return r;
}

export type StaffAddResult = {
  customer: Customer;
  /** NEW_REQUESTED | NEW_QUEUED | ALREADY_JOINED | DECLINED_BEFORE | WAITING | REQUESTED_AGAIN */
  outcome: "NEW_REQUESTED" | "NEW_QUEUED" | "ALREADY_JOINED" | "DECLINED_BEFORE" | "WAITING" | "REQUESTED_AGAIN";
};

const ASK_AGAIN_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/** A manager or the owner adds a customer (WhatsApp "add …" or the dashboard). */
export async function addCustomerByStaff(
  business: Business, location: Location, input: { name: string | null; phone: string }, now = new Date(),
): Promise<StaffAddResult> {
  const existing = await prisma.customer.findUnique({ where: { locationId_phone: { locationId: location.id, phone: input.phone } } });
  if (existing) {
    const customer = input.name && !existing.name
      ? await prisma.customer.update({ where: { id: existing.id }, data: { name: input.name } })
      : existing;
    if (customer.consentStatus === "GRANTED" || customer.consentStatus === "IMPLIED") return { customer, outcome: "ALREADY_JOINED" };
    if (customer.consentStatus === "DECLINED") return { customer, outcome: "DECLINED_BEFORE" }; // never ask again
    if (customer.consentRequestedAt && now.getTime() - customer.consentRequestedAt.getTime() < ASK_AGAIN_AFTER_MS) return { customer, outcome: "WAITING" };
    await requestConsent(business, location, customer, now);
    return { customer, outcome: "REQUESTED_AGAIN" };
  }
  const customer = await prisma.customer.create({
    data: {
      businessId: business.id, locationId: location.id, phone: input.phone, name: input.name,
      firstSeenAt: now, lastSeenAt: now, consentStatus: "PENDING", consentSource: "MANAGER",
    },
  });
  const r = await requestConsent(business, location, customer, now);
  const sent = !!r && r.ok && r.status !== "NOT_SENT";
  await logEvent({ businessId: business.id, source: "CONSENT", level: "INFO", message: `Customer added by staff, consent request ${sent ? "sent" : "queued"}`, meta: { customerId: customer.id } });
  return { customer, outcome: sent ? "NEW_REQUESTED" : "NEW_QUEUED" };
}

/** Plain-words reply to the staff member after an add. */
export function staffAddReply(r: StaffAddResult, businessName: string) {
  const who = r.customer.name ? `${r.customer.name} (+${r.customer.phone})` : `+${r.customer.phone}`;
  switch (r.outcome) {
    case "NEW_REQUESTED": return `Added ${who} to ${businessName}. They got a WhatsApp asking YES or NO; offers start only after YES.`;
    case "NEW_QUEUED": return `Added ${who} to ${businessName}. The YES/NO request will go out in contact hours; offers start only after YES.`;
    case "ALREADY_JOINED": return `${who} is already a customer of ${businessName} and can get offers.`;
    case "DECLINED_BEFORE": return `${who} said NO to messages before, so we won't ask again.`;
    case "WAITING": return `${who} was asked in the last 7 days and hasn't answered yet.`;
    case "REQUESTED_AGAIN": return `Asked ${who} again to reply YES or NO.`;
  }
}

/** QR scan: they sent "JOIN <code>" themselves. */
export async function applyJoin(customer: Customer, tag: string | null, now = new Date()) {
  return prisma.customer.update({
    where: { id: customer.id },
    data: {
      consentStatus: "GRANTED", consentSource: "QR", consentAt: now,
      ...(tag ? { joinTag: tag } : {}),
      // Scanning again after STOP means they want messages again.
      ...(customer.optedOut ? { optedOut: false, optedOutAt: null } : {}),
    },
  });
}

/** YES / NO to the consent request. */
export async function applyConsentReply(customer: Customer, decision: "GRANTED" | "DECLINED", now = new Date()) {
  return prisma.customer.update({ where: { id: customer.id }, data: { consentStatus: decision, consentAt: now } });
}

export async function welcomeText(business: Business, name: string) {
  const lang = await businessLanguage(business);
  if (lang === "en") return `Thank you for joining ${name}! You'll get our offers and updates here. Reply STOP any time to stop them.`;
  return `Dhanyavaad! Aap ${name} se jud gaye hain. Offers aur updates yahin milenge. Band karne ke liye kabhi bhi STOP likhein.`;
}

export async function consentAnswerText(business: Business, name: string, decision: "GRANTED" | "DECLINED") {
  const lang = await businessLanguage(business);
  if (decision === "GRANTED") {
    return lang === "en"
      ? `Thank you! You'll now get offers and updates from ${name}. Reply STOP any time to stop them.`
      : `Dhanyavaad! Ab aapko ${name} ke offers aur updates milenge. Band karne ke liye kabhi bhi STOP likhein.`;
  }
  return lang === "en" ? `No problem, ${name} won't send you offers.` : `Koi baat nahi, ${name} aapko offers nahi bhejega.`;
}

/**
 * Hourly: sends YES/NO requests that are still queued (imports, or a send
 * that failed), in each business's contact hours, a batch per business.
 */
export async function processQueuedConsentRequests(now = new Date(), perBusiness = 100) {
  const groups = await prisma.customer.groupBy({
    by: ["businessId"],
    where: { consentStatus: "PENDING", consentRequestedAt: null, optedOut: false, ...HAS_REAL_PHONE },
    _count: { _all: true },
  });
  let sent = 0, failed = 0;
  for (const g of groups) {
    const business = await prisma.business.findUnique({ where: { id: g.businessId } });
    if (!business || business.status !== "ACTIVE") continue;
    if (!withinContactHours(await getSettings(business), now)) continue;
    const queued = await prisma.customer.findMany({
      where: { businessId: business.id, consentStatus: "PENDING", consentRequestedAt: null, optedOut: false, ...HAS_REAL_PHONE },
      include: { location: true }, orderBy: { firstSeenAt: "asc" }, take: perBusiness,
    });
    for (const c of queued) {
      // No WhatsApp sender and no texting number yet: wait, don't fill the logs every hour.
      if (!whatsappSenderFor(c.location, business) && !c.location.smsFromNumber) { failed++; continue; }
      const r = await requestConsent(business, c.location, c, now);
      if (r && r.ok && r.status !== "NOT_SENT") sent++; else failed++;
    }
  }
  return { businesses: groups.length, sent, failed };
}
