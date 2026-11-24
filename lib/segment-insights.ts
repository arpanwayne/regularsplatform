import type { Business } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { businessLanguage } from "@/lib/whatsapp-send";
import { askClaude, cleanOfferText, inventedNumbers, LANG_STYLE, parseJsonObject } from "@/lib/offer-ai";
import { SEGMENTS, type Segment } from "@/lib/types";

/**
 * AI customer segments for offers (Nov 2026).
 *
 * 1. Every customer is re-scored from their visits, spend and recency
 *    (lib/segmentation.ts) so the groups are current.
 * 2. Each group is described from the data: size, average spend and visits,
 *    days since their last visit, and how many still message the business.
 * 3. Claude reads those numbers and suggests one targeted offer per group;
 *    without an API key, sector-aware ready-made suggestions are used.
 *
 * The pure parts (summaries, ready-made suggestions) are unit-tested.
 */

export type CustomerRow = { segment: string; visitCount: number; totalSpend: number; lastSeenAt: Date; firstSeenAt: Date; inbound30d: number };

export type SegmentSummary = {
  segment: Segment; count: number; share: number;
  avgSpend: number; avgVisits: number; medianDaysSinceVisit: number | null; engagedShare: number;
};

export type OfferSuggestion = { title: string; message: string; discountPercent: number | null; why: string };

export const SEGMENT_INFO: Record<Segment, { label: string; meaning: string }> = {
  REGULAR: { label: "Regular customers", meaning: "Come often and came recently" },
  HIGH_SPENDER: { label: "High-spending customers", meaning: "Top 20% by total spend" },
  NEW: { label: "New customers", meaning: "First came recently, not yet regulars" },
  AT_RISK: { label: "At-risk customers", meaning: "No visit in the last 30–60 days" },
  DORMANT: { label: "Dormant customers", meaning: "No visit in over 60 days" },
};

const DAY = 24 * 60 * 60 * 1000;
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Per-segment numbers, always in the same order, empty groups included. */
export function summarizeSegments(rows: CustomerRow[], now = new Date()): SegmentSummary[] {
  const total = rows.length;
  return SEGMENTS.map((segment) => {
    const g = rows.filter((r) => r.segment === segment);
    const n = g.length;
    return {
      segment, count: n, share: total ? round(n / total, 3) : 0,
      avgSpend: n ? round(g.reduce((a, r) => a + r.totalSpend, 0) / n) : 0,
      avgVisits: n ? round(g.reduce((a, r) => a + r.visitCount, 0) / n, 1) : 0,
      medianDaysSinceVisit: n ? round(median(g.map((r) => (now.getTime() - r.lastSeenAt.getTime()) / DAY))!) : null,
      engagedShare: n ? round(g.filter((r) => r.inbound30d > 0).length / n, 3) : 0,
    };
  });
}

/** What a business sells, for ready-made wording. */
function thing(sector?: string | null) {
  switch (sector) {
    case "SALON": return "service";
    case "GYM": return "session";
    case "RESTAURANT": return "meal";
    case "CLINIC": return "check-up";
    case "HOME_SERVICES": return "service visit";
    default: return "purchase";
  }
}

/** Ready-made suggestions (no AI key, or the AI failed). Clinics get no discounts (medical). */
export function fallbackSuggestion(segment: Segment, sector?: string | null): OfferSuggestion {
  const t = thing(sector), clinic = sector === "CLINIC";
  switch (segment) {
    case "REGULAR": return { title: "Thank-you for our regulars", message: `Thank you for being one of our regulars! As a small thank-you, enjoy a free add-on with your next ${t}. Just show this message at the counter.`, discountPercent: null, why: "Regulars already come back; a small surprise keeps them loyal without discounting what they'd buy anyway." };
    case "HIGH_SPENDER": return { title: "VIP early access", message: `You're one of our most valued customers, so you get first access to our newest offers before anyone else. Reply to this message and we'll keep a priority slot for you.`, discountPercent: null, why: "Top spenders respond to recognition and priority more than to discounts, which would cut your best margins." };
    case "NEW": return { title: "Welcome back offer", message: clinic ? `Thank you for visiting us! If you have any questions after your ${t}, just reply here and we'll help.` : `Thanks for choosing us! Here's 10% off your second ${t} to welcome you back. Show this message at the counter.`, discountPercent: clinic ? null : 10, why: "The second visit is when a habit starts; a small nudge now turns first-timers into regulars." };
    case "AT_RISK": return { title: "We miss you", message: clinic ? `It's been a while since your last visit. If it's time for a follow-up, reply here and we'll find you a slot.` : `It's been a few weeks and we miss you! Come back this week and get 15% off your next ${t}. Show this message at the counter.`, discountPercent: clinic ? null : 15, why: "They're slipping away but still remember you; a timely, time-limited reason brings most of them back." };
    case "DORMANT": return { title: "Come back offer", message: clinic ? `We haven't seen you in a while. If you need a check-up, reply here and we'll book you in.` : `It's been a while! We'd love to see you again, so here's 20% off your next ${t}. Show this message at the counter.`, discountPercent: clinic ? null : 20, why: "Dormant customers need a stronger reason to return; a bigger one-time offer is worth it because otherwise they're lost." };
  }
}

export function insightsPrompt(p: { businessName: string; sector?: string | null; language: string; summaries: SegmentSummary[]; currency: string }): string {
  const lines = p.summaries.filter((s) => s.count > 0).map((s) =>
    `- ${s.segment} (${SEGMENT_INFO[s.segment].meaning}): ${s.count} customers (${round(s.share * 100)}%), avg spend ${p.currency}${s.avgSpend}, avg ${s.avgVisits} visits, median ${s.medianDaysSinceVisit} days since last visit, ${round(s.engagedShare * 100)}% messaged in the last 30 days`);
  return [
    `You are a retention marketer for "${p.businessName}", a local ${String(p.sector ?? "business").toLowerCase().replace(/_/g, " ")}.`,
    "Here are its customer groups, computed from their visits and purchases:",
    ...lines,
    "",
    "For EACH group listed, suggest one targeted WhatsApp offer that fits how that group behaves.",
    `Write the message in ${LANG_STYLE[p.language] ?? LANG_STYLE.en}, max 300 characters, one line, no greeting, no business name, no opt-out line.`,
    "discountPercent: a whole number 0-30, or null for a non-discount offer. Use only numbers that come from discountPercent in the message; don't invent prices or dates.",
    p.sector === "CLINIC" ? "This is a medical clinic: no discounts or promotional pressure; use helpful reminders and follow-ups (discountPercent null)." : "Protect margins: high spenders and regulars usually need recognition more than discounts.",
    'Also give "why": one short sentence, in English, explaining the idea from the numbers.',
    'Reply ONLY with JSON: {"<SEGMENT>": {"title": "...", "message": "...", "discountPercent": 15, "why": "..."}, ...}',
  ].join("\n");
}

/** Takes the AI's suggestions that are safe to show; the rest stay ready-made. */
export function mergeSuggestions(raw: Record<string, unknown> | null, sector?: string | null): Record<Segment, OfferSuggestion & { ai: boolean }> {
  const out = {} as Record<Segment, OfferSuggestion & { ai: boolean }>;
  for (const seg of SEGMENTS) {
    const fb = { ...fallbackSuggestion(seg, sector), ai: false };
    const v = raw?.[seg] as Record<string, unknown> | undefined;
    const message = cleanOfferText(typeof v?.message === "string" ? v.message : "", 400);
    const d = typeof v?.discountPercent === "number" && Number.isInteger(v.discountPercent) && v.discountPercent > 0 && v.discountPercent <= 30 ? v.discountPercent : null;
    const discount = sector === "CLINIC" ? null : d;
    if (message.length < 10 || inventedNumbers(message, discount).length) { out[seg] = fb; continue; }
    out[seg] = {
      title: cleanOfferText(typeof v?.title === "string" ? v.title : "", 80) || fb.title,
      message, discountPercent: discount,
      why: cleanOfferText(typeof v?.why === "string" ? v.why : "", 240) || fb.why,
      ai: true,
    };
  }
  return out;
}

export async function segmentInsights(business: Business, opts: { ai: boolean }, now = new Date()) {
  await runSegmentationForBusiness(business.id);
  const [customers, inbound] = await Promise.all([
    prisma.customer.findMany({ where: { businessId: business.id }, select: { id: true, segment: true, visitCount: true, totalSpend: true, lastSeenAt: true, firstSeenAt: true } }),
    prisma.message.groupBy({ by: ["customerId"], where: { businessId: business.id, direction: "INBOUND", createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _count: { _all: true } }),
  ]);
  const inboundBy = new Map(inbound.map((m) => [m.customerId, m._count._all]));
  const summaries = summarizeSegments(customers.map((c) => ({ ...c, inbound30d: inboundBy.get(c.id) ?? 0 })), now);

  let raw: Record<string, unknown> | null = null, aiError: string | null = null;
  if (opts.ai && customers.length) {
    const language = await businessLanguage(business);
    const r = await askClaude(business.id, insightsPrompt({ businessName: business.name, sector: business.sector, language, summaries, currency: business.country === "IN" ? "₹" : "$" }), 1500);
    if (r.ok) raw = parseJsonObject(r.text);
    else aiError = r.error;
    if (r.ok && !raw) aiError = "The AI's answer wasn't usable, so these are ready-made ideas.";
  }
  return { total: customers.length, summaries, suggestions: mergeSuggestions(raw, business.sector), aiError };
}
