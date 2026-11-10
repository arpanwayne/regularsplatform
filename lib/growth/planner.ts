import { Prisma } from "@prisma/client";
import type { Business, Customer, GrowthSettings, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { gmb, videoStudio, wayneRing } from "@/lib/growth/connectors";
import { writeCopy, type CopyRequest } from "@/lib/growth/copy";
import { DAY, autonomyFor, getSettings, isoWeek, localParts, money, parseJson } from "@/lib/growth/settings";
import {
  ACTION_LABEL, ACTION_TYPES, BASE_WIN_RATE, CONVERSION_EVENTS, CUSTOMER_CONTACT, GOAL_WEIGHT, HANDLED_EVENTS,
  type ActionType, type GrowthGoal,
} from "@/lib/growth/types";

/**
 * DECIDE: turns the timeline into today's plan.
 *
 * 1. Finds candidates with simple, explainable rules (every action carries a
 *    plain-English reason the owner sees).
 * 2. Applies guardrails: opt-outs, max touches per customer per week, one
 *    action per customer per day, the daily cap, tools that aren't connected.
 * 3. Ranks by expected value = value at stake × this business's own win rate
 *    for that action type (learned from past results) × the owner's goal.
 * 4. Has Claude write the customer messages (templates without an API key).
 * 5. Saves them: AUTO actions are approved straight away, APPROVE ones go in
 *    the owner's WhatsApp/SMS brief, SUGGEST ones wait on the dashboard.
 */

type Candidate = {
  type: ActionType;
  customer?: Customer | null;
  locationId?: string | null;
  title: string;
  reason: string;
  value: number;            // value at stake
  dedupeKey: string;
  payload: Record<string, unknown>;
};

const first = (n?: string | null) => (n ?? "").trim().split(/\s+/)[0] || "";
const who = (c?: Customer | null) => (c?.name ? c.name : c ? `+${c.phone}` : "");
const daysAgo = (d: Date, now: Date) => Math.max(0, Math.round((now.getTime() - d.getTime()) / DAY));

/** LEARN: this business's win rate per action type, smoothed toward the base rate. */
export async function learnedWinRates(businessId: string, now = new Date()) {
  const done = await prisma.growthAction.findMany({
    where: { businessId, status: "DONE", executedAt: { gte: new Date(now.getTime() - 90 * DAY) } },
    select: { type: true, outcome: true },
  });
  const out = {} as Record<ActionType, number>;
  for (const t of ACTION_TYPES) {
    const rows = done.filter((d) => d.type === t);
    const wins = rows.filter((d) => d.outcome === "WON").length;
    out[t] = (wins + BASE_WIN_RATE[t] * 10) / (rows.length + 10);
  }
  return out;
}

async function conversionsBetween(businessId: string, from: Date, to: Date) {
  return prisma.growthEvent.count({ where: { businessId, type: { in: CONVERSION_EVENTS }, occurredAt: { gte: from, lt: to } } });
}

async function findCandidates(business: Business & { locations: Location[] }, s: GrowthSettings, now: Date): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const loc = business.locations.find((l) => l.status === "ACTIVE") ?? business.locations[0];
  const callOk = wayneRing.available(s);

  // a. Missed leads — called in the last 48h, never got through, no contact since.
  const missed = await prisma.growthEvent.findMany({
    where: { businessId: business.id, type: { in: ["CALL_MISSED", "CALL_SHORT"] }, occurredAt: { gte: new Date(now.getTime() - 2 * DAY) }, customerId: { not: null } },
    include: { customer: true }, orderBy: { occurredAt: "desc" },
  });
  const seenMissed = new Set<string>();
  for (const e of missed) {
    if (!e.customer || seenMissed.has(e.customer.id)) continue;
    seenMissed.add(e.customer.id);
    const after = await prisma.growthEvent.count({ where: { businessId: business.id, customerId: e.customer.id, type: { in: HANDLED_EVENTS }, occurredAt: { gt: e.occurredAt } } });
    if (after > 0) continue;
    const d = parseJson<{ summary?: string }>(e.data, {});
    out.push({
      type: "MISSED_LEAD_CALLBACK", customer: e.customer, locationId: e.locationId,
      title: `${callOk ? "Call back" : "Text"} ${who(e.customer)}`,
      reason: `Called ${daysAgo(e.occurredAt, now) === 0 ? "today" : daysAgo(e.occurredAt, now) === 1 ? "yesterday" : `${daysAgo(e.occurredAt, now)} days ago`} and didn't get through. No contact since.`,
      value: s.avgJobValue, dedupeKey: `MISSED:${e.id}`,
      payload: { channel: callOk ? "CALL" : "TEXT", purpose: "MISSED_LEAD", relationship: "caller", context: d.summary || "Called and hung up before speaking to anyone." },
    });
  }

  // b. Quotes gone quiet — sent 3–30 days ago, not accepted/declined, max 2 follow-ups 5+ days apart.
  const quotes = await prisma.growthEvent.findMany({
    where: { businessId: business.id, type: "QUOTE_SENT", customerId: { not: null }, ref: { not: null },
             occurredAt: { gte: new Date(now.getTime() - 30 * DAY), lt: new Date(now.getTime() - s.quoteFollowupDays * DAY) } },
    include: { customer: true }, orderBy: { occurredAt: "desc" }, take: 50,
  });
  for (const q of quotes) {
    if (!q.customer || !q.ref) continue;
    const closed = await prisma.growthEvent.count({ where: { businessId: business.id, ref: q.ref, type: { in: ["QUOTE_ACCEPTED", "QUOTE_DECLINED", "JOB_DONE", "INVOICE_PAID"] } } });
    if (closed) continue;
    const prior = await prisma.growthAction.findMany({ where: { businessId: business.id, type: "QUOTE_FOLLOW_UP", dedupeKey: { startsWith: `QUOTE:${q.ref}:` } }, orderBy: { createdAt: "desc" } });
    if (prior.length >= 2) continue;
    if (prior[0] && now.getTime() - prior[0].createdAt.getTime() < 5 * DAY) continue;
    const value = q.value ?? s.avgJobValue;
    const d = parseJson<{ description?: string }>(q.data, {});
    const call = callOk && value >= s.callQuoteAbove;
    out.push({
      type: "QUOTE_FOLLOW_UP", customer: q.customer, locationId: q.locationId,
      title: `${call ? "Call" : "Text"} ${who(q.customer)} about their ${money(s, value)} quote`,
      reason: `Quote sent ${daysAgo(q.occurredAt, now)} days ago with no reply${prior.length ? " (second follow-up)" : ""}.`,
      value, dedupeKey: `QUOTE:${q.ref}:${prior.length + 1}`,
      payload: { channel: call ? "CALL" : "TEXT", purpose: "QUOTE_FOLLOWUP", relationship: "customer", quoteRef: q.ref, quoteValue: value,
                 context: `${d.description ? `Quote for ${d.description}, ` : "Quote "}${money(s, value)}, sent ${daysAgo(q.occurredAt, now)} days ago.` },
    });
  }

  // c. Service due — last visit/job one service interval ago.
  if (s.serviceIntervalDays) {
    const due = await prisma.customer.findMany({
      where: { businessId: business.id, optedOut: false, visitCount: { gte: 1 },
               lastSeenAt: { gte: new Date(now.getTime() - (s.serviceIntervalDays + 60) * DAY), lt: new Date(now.getTime() - (s.serviceIntervalDays - 7) * DAY) } },
      orderBy: { totalSpend: "desc" }, take: 30,
    });
    for (const c of due) {
      out.push({
        type: "SERVICE_DUE", customer: c, locationId: c.locationId,
        title: `Remind ${who(c)} their service is due`,
        reason: `Last visit ${daysAgo(c.lastSeenAt, now)} days ago; your service interval is ${s.serviceIntervalDays} days.`,
        value: c.visitCount ? Math.max(s.avgJobValue, c.totalSpend / c.visitCount) : s.avgJobValue,
        dedupeKey: `SERVICE:${c.id}:${c.lastSeenAt.toISOString().slice(0, 10)}`,
        payload: { channel: "TEXT", purpose: "SERVICE_DUE", relationship: "customer", context: `Last visit ${daysAgo(c.lastSeenAt, now)} days ago, ${c.visitCount} visits in total.` },
      });
    }
  }

  // d. Win-backs — at-risk / dormant, no win-back in 30 days.
  const quiet = await prisma.customer.findMany({
    where: { businessId: business.id, segment: { in: ["AT_RISK", "DORMANT"] }, optedOut: false,
             OR: [{ lastWinbackAt: null }, { lastWinbackAt: { lt: new Date(now.getTime() - 30 * DAY) } }] },
    orderBy: { totalSpend: "desc" }, take: 30,
  });
  const month = localParts(now, s.timezone).date.slice(0, 7);
  for (const c of quiet) {
    out.push({
      type: "WIN_BACK", customer: c, locationId: c.locationId,
      title: `Win back ${who(c)}`,
      reason: `${c.segment === "DORMANT" ? "Dormant" : "At risk"}: last seen ${daysAgo(c.lastSeenAt, now)} days ago after ${c.visitCount} visit${c.visitCount === 1 ? "" : "s"}.`,
      value: c.visitCount ? Math.max(s.avgJobValue * 0.5, c.totalSpend / c.visitCount) : s.avgJobValue * 0.5,
      dedupeKey: `WINBACK:${c.id}:${month}`,
      payload: { channel: "TEXT", purpose: "WINBACK", relationship: "customer", context: `${c.visitCount} past visits, last one ${daysAgo(c.lastSeenAt, now)} days ago.` },
    });
  }

  // e. Review requests — visit/job in the last 48h (only when the automatic request is off).
  if (!business.autoReviewRequest && loc?.googleReviewUrl) {
    const visits = await prisma.visit.findMany({
      where: { businessId: business.id, occurredAt: { gte: new Date(now.getTime() - 2 * DAY) } },
      include: { customer: true }, orderBy: { occurredAt: "desc" }, take: 30,
    });
    for (const v of visits) {
      const c = v.customer;
      if (c.lastReviewRequestAt && now.getTime() - c.lastReviewRequestAt.getTime() < 90 * DAY) continue;
      out.push({
        type: "REVIEW_REQUEST", customer: c, locationId: v.locationId,
        title: `Ask ${who(c)} for a Google review`, reason: `Visited ${daysAgo(v.occurredAt, now) === 0 ? "today" : "yesterday"}.`,
        value: s.avgJobValue * 0.2, dedupeKey: `REVIEWREQ:${v.id}`, payload: { channel: "TEXT" },
      });
    }
  }

  // f–h. Google profile and content (GMB Manager / Video Studio).
  const week = isoWeek(localParts(now, s.timezone).date);
  const thisWeek = await conversionsBetween(business.id, new Date(now.getTime() - 7 * DAY), now);
  const lastWeek = await conversionsBetween(business.id, new Date(now.getTime() - 14 * DAY), new Date(now.getTime() - 7 * DAY));
  const slow = lastWeek >= 3 && thisWeek < lastWeek * 0.8;

  if (gmb.available(s)) {
    try {
      const reviews = (await gmb.unrepliedReviews(s)).filter((r) => !r.posted_at || now.getTime() - new Date(r.posted_at).getTime() < 30 * DAY).slice(0, 5);
      for (const r of reviews) {
        const draft = r.ai_draft_reply || (await gmb.draftReply(s, r.id).catch(() => "")) || "";
        if (!draft) continue;
        out.push({
          type: "REVIEW_REPLY", title: `Reply to ${r.reviewer_name ? `${r.reviewer_name}'s` : "a"} ${r.star_rating ?? "?"}-star review`,
          reason: `New Google review with no reply${r.star_rating && r.star_rating <= 3 ? " — a low rating, worth answering fast" : ""}.`,
          value: s.avgJobValue * (r.star_rating && r.star_rating <= 3 ? 0.6 : 0.2), dedupeKey: `REVIEWREPLY:${r.id}`,
          payload: { reviewId: r.id, stars: r.star_rating, reviewer: r.reviewer_name, comment: (r.comment ?? "").slice(0, 500), reply: draft },
        });
      }
    } catch { /* GMB down: skip this run, try next time */ }

    const recentPost = await prisma.growthAction.count({ where: { businessId: business.id, type: "GOOGLE_POST", status: { in: ["PROPOSED", "APPROVED", "EXECUTING", "DONE"] }, createdAt: { gte: new Date(now.getTime() - 6 * DAY) } } });
    if (!recentPost) {
      out.push({
        type: "GOOGLE_POST", title: slow ? "Publish a Google offer post for this slow week" : "Publish this week's Google update",
        reason: slow ? `Bookings this week (${thisWeek}) are behind last week (${lastWeek}).` : "No Google post in the last 6 days; fresh posts help local ranking.",
        value: s.avgJobValue * (slow ? 1 : 0.5), dedupeKey: `POST:${week}`,
        payload: { postType: slow ? "offer" : "update", ctaUrl: loc?.bookingUrl ?? null,
                   prompt: slow ? `A friendly limited-time reason to book ${business.name} this week. Do not invent a discount amount.` : `A short, useful seasonal tip from ${business.name} that ends with an invitation to book.` },
      });
    }
  }
  if (slow && videoStudio.available(s)) {
    out.push({
      type: "PROMO_REEL", title: "Make a 15-second promo Reel for this slow week",
      reason: `Bookings this week (${thisWeek}) are behind last week (${lastWeek}).`,
      value: s.avgJobValue, dedupeKey: `REEL:${week}`,
      payload: { name: `${business.name} — slow week promo ${week}`, brief: `15-second vertical promo for ${business.name}. Friendly, local, ends with "Book today".`, overlay: "Book today" },
    });
  }
  return out;
}

/** Touches (outbound messages + done contact actions) per customer in the last 7 days. */
async function touchesThisWeek(businessId: string, customerIds: string[], now: Date) {
  const since = new Date(now.getTime() - 7 * DAY);
  const counts = new Map<string, number>();
  if (!customerIds.length) return counts;
  const msgs = await prisma.message.findMany({ where: { businessId, customerId: { in: customerIds }, direction: "OUTBOUND", createdAt: { gte: since } }, select: { customerId: true } });
  const acts = await prisma.growthAction.findMany({ where: { businessId, customerId: { in: customerIds }, status: "DONE", executedAt: { gte: since }, type: { in: CUSTOMER_CONTACT } }, select: { customerId: true, payload: true } });
  for (const m of msgs) counts.set(m.customerId, (counts.get(m.customerId) ?? 0) + 1);
  // Calls don't create Message rows, so count them from actions.
  for (const a of acts) if (a.customerId && parseJson<{ channel?: string }>(a.payload, {}).channel === "CALL") counts.set(a.customerId, (counts.get(a.customerId) ?? 0) + 1);
  return counts;
}

export async function planForBusiness(businessId: string, now = new Date()) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { locations: true } });
  const s = await getSettings(business);
  const today = localParts(now, s.timezone).date;

  // Old proposals nobody acted on expire, so the brief never shows stale items.
  await prisma.growthAction.updateMany({
    where: { businessId, status: "PROPOSED", planDate: { lt: today }, createdAt: { lt: new Date(now.getTime() - 2 * DAY) } },
    data: { status: "EXPIRED" },
  });

  const rates = await learnedWinRates(businessId, now);
  const goalW = GOAL_WEIGHT[s.goal as GrowthGoal] ?? {};
  let cands = await findCandidates(business, s, now);

  // Guardrails.
  const ids = [...new Set(cands.map((c) => c.customer?.id).filter(Boolean) as string[])];
  const touches = await touchesThisWeek(businessId, ids, now);
  cands = cands.filter((c) => {
    if (!c.customer || !CUSTOMER_CONTACT.includes(c.type)) return true;
    if (c.customer.optedOut) return false;
    if (c.payload.channel === "TEXT" && c.customer.smsOptedOut && (c.customer.preferredChannel ?? business.defaultChannel) === "SMS") return false;
    return (touches.get(c.customer.id) ?? 0) < s.maxTouchesPerWeek;
  });
  const existing = await prisma.growthAction.findMany({ where: { businessId, dedupeKey: { in: cands.map((c) => c.dedupeKey) } }, select: { dedupeKey: true } });
  const taken = new Set(existing.map((e) => e.dedupeKey));
  cands = cands.filter((c) => !taken.has(c.dedupeKey));

  const scored = cands
    .map((c) => ({ c, ev: c.value * rates[c.type], prio: c.value * rates[c.type] * (goalW[c.type] ?? 1) }))
    .sort((a, b) => b.prio - a.prio);

  // One action per customer per plan; respect today's cap.
  const already = await prisma.growthAction.count({ where: { businessId, planDate: today } });
  const room = Math.max(0, s.dailyActionCap - already);
  const perCustomer = new Set<string>();
  const chosen: typeof scored = [];
  for (const x of scored) {
    if (chosen.length >= room) break;
    const cid = x.c.customer?.id;
    if (cid && perCustomer.has(cid)) continue;
    if (cid) perCustomer.add(cid);
    chosen.push(x);
  }

  // Copy for text messages.
  const loc = business.locations.find((l) => l.status === "ACTIVE") ?? business.locations[0];
  const copyReqs: CopyRequest[] = chosen
    .filter((x) => CUSTOMER_CONTACT.includes(x.c.type) && x.c.type !== "REVIEW_REQUEST" && x.c.payload.channel === "TEXT")
    .map((x) => ({ id: x.c.dedupeKey, type: x.c.type, firstName: first(x.c.customer?.name), context: String(x.c.payload.context ?? x.c.reason), bookingUrl: loc?.bookingUrl }));
  const copy = await writeCopy({ businessId, businessName: loc?.smsSenderName || business.name, language: s.messageLanguage, requests: copyReqs });

  const created = [];
  for (const x of chosen) {
    const autonomy = autonomyFor(s, x.c.type);
    const payload = { ...x.c.payload, ...(copy[x.c.dedupeKey] ? { message: copy[x.c.dedupeKey] } : {}) };
    try {
      created.push(await prisma.growthAction.create({
        data: {
          businessId, locationId: x.c.locationId ?? loc?.id ?? null, customerId: x.c.customer?.id ?? null,
          type: x.c.type, status: autonomy === "AUTO" ? "APPROVED" : "PROPOSED", autonomy,
          title: x.c.title, reason: x.c.reason, payload: JSON.stringify(payload),
          expectedValue: Math.round(x.ev * 100) / 100, priority: Math.round(x.prio * 100) / 100,
          planDate: today, dedupeKey: x.c.dedupeKey,
        },
      }));
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    }
  }
  await prisma.growthSettings.update({ where: { businessId }, data: { lastPlanDate: today } });
  return { today, created, considered: cands.length, labels: ACTION_LABEL };
}
