import type { Business, Location, Offer, Prisma, User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { marketingConsentFilter } from "@/lib/consent";
import { HAS_REAL_PHONE } from "@/lib/instagram-shared";
import { isPlaceholderPhone, normalizePhone } from "@/lib/phone";
import { sendCustomerSms, senderName, type SendResult } from "@/lib/sms";
import { businessLanguage, sendCustomerWhatsApp } from "@/lib/whatsapp-send";
import { sendToOwner } from "@/lib/growth/brief";
import { getSettings, withinContactHours } from "@/lib/growth/settings";
import { SEGMENTS, type Segment } from "@/lib/types";

/**
 * Offers + owner approval (onboarding flow, Nov 2026).
 *
 *   manager writes an offer  ──► inside the owner's limits? ──yes──► APPROVED → sent in contact hours
 *                                          │no
 *                                          ▼
 *                     owner gets WhatsApp: "… Reply APPROVE 7 or REJECT 7"
 *                       APPROVE → APPROVED → sent      REJECT → REJECTED
 *                       no answer 24h → one reminder;  48h → EXPIRED (never sent without a yes)
 *
 * Offers the owner writes go out without asking. Clinics: every manager offer
 * needs the owner (medical — no automatic promotions).
 */

export const APPROVAL_REMINDER_MS = 24 * 60 * 60 * 1000;
export const APPROVAL_EXPIRY_MS = 48 * 60 * 60 * 1000;
/** Safety cap: one offer reaches at most this many customers. */
export const MAX_OFFER_RECIPIENTS = 2000;

export type ApprovalLimits = Pick<Business, "approvalMaxDiscount" | "approvalMaxAudience" | "approvalAutoFreebie">;

// ── Pure rules (unit-tested) ──────────────────────────────────────────────

/** Does this offer need the owner's OK, and why (plain words for the owner). */
export function approvalCheck(
  o: { discountPercent: number | null; freebie: boolean; audienceCount: number; byOwner: boolean; sector?: string | null },
  limits: ApprovalLimits,
): { auto: boolean; reasons: string[] } {
  if (o.byOwner) return { auto: true, reasons: [] };
  const reasons: string[] = [];
  if (o.sector === "CLINIC") reasons.push("clinic offers always need the owner's OK");
  if ((o.discountPercent ?? 0) > limits.approvalMaxDiscount) reasons.push(`${o.discountPercent}% off is above the ${limits.approvalMaxDiscount}% limit`);
  if (o.audienceCount > limits.approvalMaxAudience) reasons.push(`${o.audienceCount} customers is above the ${limits.approvalMaxAudience} limit`);
  if (o.freebie && !limits.approvalAutoFreebie) reasons.push("free items or bonus points need the owner's OK");
  return { auto: reasons.length === 0, reasons };
}

/**
 * The owner's answer: "APPROVE 7", "reject 7", "approve", "yes 7", "haan 7".
 * Bare yes/ok/no need the number (bare "no" already means SKIP for the morning plan).
 */
export function parseApprovalReply(text: string | null | undefined): { decision: "APPROVE" | "REJECT"; no: number | null } | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[.!]+$/, "").replace(/\s+/g, " ");
  const word = (w: string) => (/^(approve|approved|yes|ok|haan)$/.test(w) ? "APPROVE" : "REJECT") as "APPROVE" | "REJECT";
  let m = t.match(/^(approve|approved|reject|rejected)(?: ?#? ?(\d{1,5}))?$/);
  if (m) return { decision: word(m[1]), no: m[2] ? Number(m[2]) : null };
  m = t.match(/^(yes|ok|haan|no|nahi) ?#? ?(\d{1,5})$/);
  if (m) return { decision: word(m[1]), no: Number(m[2]) };
  return null;
}

export function parseSegments(raw: string | string[] | null | undefined): Segment[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  return [...new Set(list.map((s) => s.trim().toUpperCase()).filter((s): s is Segment => (SEGMENTS as string[]).includes(s)))];
}

/** One line for the owner's WhatsApp (no new lines allowed in a template variable). */
export function offerSummary(o: Pick<Offer, "title" | "message" | "discountPercent" | "freebie">) {
  const extra = [o.discountPercent ? `${o.discountPercent}% off` : null, o.freebie ? "free item/points" : null].filter(Boolean).join(", ");
  const msg = o.message.replace(/\s+/g, " ").trim();
  const body = msg.length > 300 ? msg.slice(0, 299) + "…" : msg;
  return `${o.title}${extra ? ` (${extra})` : ""}: ${body}`;
}

// ── Audience ──────────────────────────────────────────────────────────────

/** Customers an offer may go to: not opted out, consent ok (lib/consent.ts), a real phone, the chosen segments. */
export function audienceWhere(business: Pick<Business, "id" | "country">, segments: Segment[], now = new Date()): Prisma.CustomerWhereInput {
  return {
    businessId: business.id,
    optedOut: false,
    ...HAS_REAL_PHONE,
    ...marketingConsentFilter(business.country, now),
    ...(segments.length ? { segment: { in: segments } } : {}),
  };
}

export const countAudience = (business: Pick<Business, "id" | "country">, segments: Segment[], now = new Date()) =>
  prisma.customer.count({ where: audienceWhere(business, segments, now) });

// ── Owner side ────────────────────────────────────────────────────────────

/** Every number the owner may answer from: their login's mobile, the brief number, the locations' owner numbers. */
export async function ownerPhones(business: Business & { locations: Location[] }) {
  const [owner, s] = await Promise.all([
    prisma.user.findUnique({ where: { id: business.ownerId }, select: { phone: true } }),
    prisma.growthSettings.findUnique({ where: { businessId: business.id }, select: { ownerPhone: true } }),
  ]);
  const raw = [owner?.phone, s?.ownerPhone, ...business.locations.map((l) => l.ownerNotifyPhone)];
  return [...new Set(raw.filter((p): p is string => !!p && !isPlaceholderPhone(p)).map((p) => normalizePhone(p, business.country)).filter((p): p is string => !!p))];
}

async function messageOwner(business: Business, body: string, wa?: { templateKey: "owner_approval"; params: string[] }) {
  const full = await prisma.business.findUniqueOrThrow({ where: { id: business.id }, include: { locations: true } });
  const s = await getSettings(full);
  // The owner's login mobile counts too when no brief number is saved.
  const owner = await prisma.user.findUnique({ where: { id: full.ownerId }, select: { phone: true } });
  return sendToOwner(full, { ...s, ownerPhone: s.ownerPhone || full.locations.find((l) => l.ownerNotifyPhone)?.ownerNotifyPhone || owner?.phone || null }, body, wa);
}

async function askOwner(business: Business, offer: Offer, creator: string, reminder = false) {
  const name = business.name;
  const summary = offerSummary(offer);
  const body = `${reminder ? "Reminder: " : ""}Approval needed for ${name}: ${creator} wants to send an offer to ${offer.audienceCount} customers. Offer: ${summary} Reply APPROVE ${offer.approvalNo} or REJECT ${offer.approvalNo}.`;
  const sent = await messageOwner(business, body, {
    templateKey: "owner_approval",
    params: [name, creator, String(offer.audienceCount), `${reminder ? "(Reminder) " : ""}${summary}`, String(offer.approvalNo)],
  });
  if (!sent) {
    await logEvent({ businessId: business.id, source: "OFFER", level: "WARN", message: `Owner could not be asked to approve offer #${offer.approvalNo}; it can still be approved on Dashboard → Offers` });
  }
  return sent;
}

// ── Create / decide / send ────────────────────────────────────────────────

export type OfferInput = {
  title: string; message: string; discountPercent: number | null; freebie: boolean; segments: Segment[]; sendAt: Date | null;
};

export async function createOffer(business: Business, user: Pick<User, "id" | "name">, input: OfferInput, now = new Date()) {
  const byOwner = business.ownerId === user.id;
  const audienceCount = await countAudience(business, input.segments, now);
  const check = approvalCheck({ discountPercent: input.discountPercent, freebie: input.freebie, audienceCount, byOwner, sector: business.sector }, business);

  let offer: Offer | null = null;
  for (let i = 0; i < 5 && !offer; i++) {
    const last = await prisma.offer.aggregate({ where: { businessId: business.id }, _max: { approvalNo: true } });
    try {
      offer = await prisma.offer.create({
        data: {
          businessId: business.id, createdById: user.id,
          title: input.title, message: input.message, discountPercent: input.discountPercent, freebie: input.freebie,
          segments: input.segments.join(","), audienceCount, sendAt: input.sendAt,
          approvalNo: (last._max.approvalNo ?? 0) + 1,
          status: check.auto ? "APPROVED" : "PENDING_APPROVAL",
          approvalReason: check.reasons.join("; "),
          requestedAt: now,
          ...(check.auto ? { decidedAt: now, decidedVia: "AUTO" } : {}),
        },
      });
    } catch (err) {
      if (String((err as { code?: string })?.code) !== "P2002") throw err; // two offers at once — take the next number
    }
  }
  if (!offer) throw new Error("Could not number the offer");

  await logEvent({ businessId: business.id, source: "OFFER", level: "INFO", message: `Offer #${offer.approvalNo} created (${check.auto ? "approved automatically" : "waiting for the owner"})`, meta: { offerId: offer.id, audienceCount, reasons: check.reasons } });
  if (check.auto) await sendIfDue(offer.id, now);
  else await askOwner(business, offer, user.name || "Your manager");
  return { offer: await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } }), auto: check.auto, reasons: check.reasons };
}

/** APPROVE / REJECT from the owner (WhatsApp, SMS or the dashboard). Only a waiting offer can be decided. */
export async function decideOffer(business: Business, offerId: string, decision: "APPROVE" | "REJECT", via: "WHATSAPP" | "SMS" | "DASHBOARD", now = new Date()) {
  const r = await prisma.offer.updateMany({
    where: { id: offerId, businessId: business.id, status: "PENDING_APPROVAL" },
    data: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", decidedAt: now, decidedVia: via },
  });
  const offer = await prisma.offer.findFirst({ where: { id: offerId, businessId: business.id } });
  if (!r.count || !offer) return { changed: false, offer };
  await logEvent({ businessId: business.id, source: "OFFER", level: "INFO", message: `Offer #${offer.approvalNo} ${decision === "APPROVE" ? "approved" : "rejected"} by the owner (${via.toLowerCase()})` });
  if (decision === "APPROVE") await sendIfDue(offer.id, now);
  return { changed: true, offer: await prisma.offer.findUniqueOrThrow({ where: { id: offer.id } }) };
}

/** Sends an APPROVED offer now if its time has come and it is contact hours; otherwise the hourly cron does. */
export async function sendIfDue(offerId: string, now = new Date()) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, include: { business: true } });
  if (!offer || offer.status !== "APPROVED") return false;
  if (offer.sendAt && offer.sendAt > now) return false;
  if (offer.business.status !== "ACTIVE") return false;
  if (!withinContactHours(await getSettings(offer.business), now)) return false;
  await sendOffer(offer.id, now);
  return true;
}

export async function sendOffer(offerId: string, now = new Date()) {
  // Claim it, so the cron and an owner's reply can't both send it.
  const claimed = await prisma.offer.updateMany({ where: { id: offerId, status: "APPROVED" }, data: { status: "SENDING" } });
  if (!claimed.count) return null;
  const offer = await prisma.offer.findUniqueOrThrow({ where: { id: offerId }, include: { business: true } });
  const business = offer.business;
  const lang = await businessLanguage(business);
  const customers = await prisma.customer.findMany({
    where: audienceWhere(business, parseSegments(offer.segments), now),
    include: { location: true }, orderBy: { lastSeenAt: "desc" }, take: MAX_OFFER_RECIPIENTS,
  });
  let sent = 0, failed = 0;
  for (const c of customers) {
    if (c.location.status !== "ACTIVE") { failed++; continue; }
    const first = (c.name ?? "").trim().split(/\s+/)[0] || (lang === "en" ? "there" : "ji");
    const channel = c.preferredChannel ?? business.defaultChannel;
    let r: SendResult | null = null;
    if (channel === "WHATSAPP") {
      r = await sendCustomerWhatsApp({ business, location: c.location, customer: c, purpose: "OFFER", templateKey: "offer", params: [first, senderName(c.location, business), offer.message], now });
    }
    if (!r) r = await sendCustomerSms({ business, location: c.location, customer: c, purpose: "OFFER", body: offer.message });
    if (r.ok && r.status !== "NOT_SENT") sent++; else failed++;
  }
  await prisma.offer.update({ where: { id: offer.id }, data: { status: "SENT", sentAt: now, sentCount: sent, failedCount: failed } });
  await logEvent({ businessId: business.id, source: "OFFER", level: "INFO", message: `Offer #${offer.approvalNo} sent: ${sent} delivered to WhatsApp/SMS, ${failed} not sent`, meta: { offerId: offer.id } });
  return { sent, failed };
}

/**
 * Hourly (app/api/cron/offers): expire offers the owner never answered (48h),
 * remind once at 24h, and send approved offers that are due.
 */
export async function processOffers(now = new Date()) {
  const expired = await prisma.offer.updateMany({
    where: { status: "PENDING_APPROVAL", requestedAt: { lte: new Date(now.getTime() - APPROVAL_EXPIRY_MS) } },
    data: { status: "EXPIRED", decidedAt: now, decidedVia: "TIMEOUT" },
  });

  const toRemind = await prisma.offer.findMany({
    where: { status: "PENDING_APPROVAL", reminderSentAt: null, requestedAt: { lte: new Date(now.getTime() - APPROVAL_REMINDER_MS) } },
    include: { business: true, createdBy: { select: { name: true } } },
  });
  let reminded = 0;
  for (const o of toRemind) {
    await prisma.offer.update({ where: { id: o.id }, data: { reminderSentAt: now } });
    if (await askOwner(o.business, o, o.createdBy?.name || "Your manager", true)) reminded++;
  }

  const due = await prisma.offer.findMany({
    where: { status: "APPROVED", OR: [{ sendAt: null }, { sendAt: { lte: now } }] },
    select: { id: true }, orderBy: { decidedAt: "asc" }, take: 50,
  });
  let sent = 0;
  for (const o of due) if (await sendIfDue(o.id, now)) sent++;

  return { expired: expired.count, reminded, sent };
}
