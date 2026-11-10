import type { Business, GrowthAction, GrowthSettings, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { normalizePhone } from "@/lib/phone";
import { countSegments, smsConfigured, twilioSend } from "@/lib/sms";
import { executeAction } from "@/lib/growth/executor";
import { DAY, getSettings, isoWeek, localParts, money } from "@/lib/growth/settings";
import { ACTION_LABEL, type ActionType } from "@/lib/growth/types";

/**
 * The owner's side of the loop, over SMS (WhatsApp works the same once a
 * WhatsApp owner channel is added):
 *
 *   8 am brief   "Maple HVAC · Growth Manager, Tue
 *                 This week so far: 3 jobs won, about $2,450.
 *                 Today I'd like to:
 *                 1) Call back Daniel R. (missed call yesterday)
 *                 2) Follow up 2 quotes ($3,100)
 *                 3) Win back 6 quiet customers
 *                 Reply 1, 2, 3, ALL or SKIP."
 *   owner reply  "1 3" / "ALL" / "SKIP" → approves those items and runs them
 *   Monday       weekly report: what the AI did and the revenue it influenced
 */

type Item = { n: number; type: ActionType; actions: GrowthAction[]; label: string };

const firstLoc = (b: Business & { locations: Location[] }) => b.locations.find((l) => l.status === "ACTIVE") ?? b.locations[0];

export function ownerPhoneFor(s: GrowthSettings, b: Business & { locations: Location[] }) {
  return s.ownerPhone || firstLoc(b)?.ownerNotifyPhone || null;
}

/** Groups today's proposals into numbered brief items (one item per action type; single actions keep their own title). */
export function briefItems(actions: GrowthAction[]): Item[] {
  const order: ActionType[] = [];
  const byType = new Map<ActionType, GrowthAction[]>();
  for (const a of [...actions].sort((x, y) => y.priority - x.priority)) {
    const t = a.type as ActionType;
    if (!byType.has(t)) { byType.set(t, []); order.push(t); }
    byType.get(t)!.push(a);
  }
  return order.map((type, i) => {
    const list = byType.get(type)!;
    const why = list[0].reason.split(/\.(\s|$)/)[0];
    const label = list.length === 1 ? `${list[0].title} (${why.charAt(0).toLowerCase()}${why.slice(1)})` : ACTION_LABEL[type].many(list.length);
    return { n: i + 1, type, actions: list, label };
  });
}

export async function weekStats(businessId: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  const [done, won] = await Promise.all([
    prisma.growthAction.count({ where: { businessId, status: "DONE", executedAt: { gte: since } } }),
    prisma.growthAction.findMany({ where: { businessId, outcome: "WON", outcomeAt: { gte: since } }, select: { outcomeValue: true } }),
  ]);
  return { done, wins: won.length, value: won.reduce((s, a) => s + (a.outcomeValue ?? 0), 0) };
}

export function composeBrief(p: { name: string; weekday: string; items: Item[]; autoCount: number; stats: { wins: number; value: number }; s: GrowthSettings }) {
  const lines = [`${p.name} · Growth Manager, ${p.weekday}`];
  if (p.stats.wins) lines.push(`Last 7 days: ${p.stats.wins} customer${p.stats.wins === 1 ? "" : "s"} won, about ${money(p.s, p.stats.value)}.`);
  if (p.items.length) {
    lines.push("Today I'd like to:");
    for (const it of p.items) lines.push(`${it.n}) ${it.label}`);
    lines.push(`Reply ${p.items.map((i) => i.n).join(", ")}, ALL or SKIP.`);
  } else {
    lines.push("Nothing needs your OK today.");
  }
  if (p.autoCount) lines.push(`Doing automatically: ${p.autoCount} action${p.autoCount === 1 ? "" : "s"}.`);
  return lines.join("\n");
}

async function sendToOwner(business: Business & { locations: Location[] }, s: GrowthSettings, body: string) {
  const to = ownerPhoneFor(s, business);
  const from = firstLoc(business)?.smsFromNumber || process.env.GROWTH_SMS_FROM;
  if (!to || !from || !smsConfigured()) {
    await logEvent({ businessId: business.id, source: "GROWTH", level: "INFO", message: "Owner message not sent (dry-run or no owner number)", meta: { body } });
    return false;
  }
  try {
    await twilioSend(from, to, body.length > 900 ? body.slice(0, 897) + "…" : body);
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "SMS_SENT", smsSegments: countSegments(body) } });
    return true;
  } catch (err) {
    await logEvent({ businessId: business.id, source: "GROWTH", level: "ERROR", message: "Owner message failed", meta: { error: err instanceof Error ? err.message : String(err) } });
    return false;
  }
}

/** Numbers today's APPROVE-level proposals, saves the numbering, and texts the owner. */
export async function sendDailyBrief(businessId: string, now = new Date()) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { locations: true } });
  const s = await getSettings(business);
  const { date, weekday } = localParts(now, s.timezone);
  const proposals = await prisma.growthAction.findMany({ where: { businessId, status: "PROPOSED", autonomy: "APPROVE", planDate: date } });
  const items = briefItems(proposals);
  for (const it of items) {
    await prisma.growthAction.updateMany({ where: { id: { in: it.actions.map((a) => a.id) } }, data: { briefDate: date, briefItem: it.n } });
  }
  const autoCount = await prisma.growthAction.count({ where: { businessId, planDate: date, autonomy: "AUTO" } });
  const body = composeBrief({ name: firstLoc(business)?.smsSenderName || business.name, weekday, items, autoCount, stats: await weekStats(businessId, now), s });
  const sent = await sendToOwner(business, s, body);
  return { body, sent, items: items.map((i) => ({ n: i.n, type: i.type, count: i.actions.length })) };
}

/** "1 3", "1,2", "all", "skip" → which brief items. null = not a brief reply. */
export function parseOwnerReply(text: string): { approve: number[] | "ALL"; skip: boolean } | null {
  const t = text.trim().toLowerCase().replace(/[.!]+$/, "");
  if (/^(all|yes all|ok all|sab|haan sab)$/.test(t)) return { approve: "ALL", skip: false };
  if (/^(skip|no|none|nahi)$/.test(t)) return { approve: [], skip: true };
  if (/^\d{1,2}([\s,&]+(and\s+)?\d{1,2})*$/.test(t)) return { approve: [...new Set(t.split(/[^\d]+/).filter(Boolean).map(Number))], skip: false };
  return null;
}

/**
 * Called by the SMS webhook before normal inbox handling. Returns true when
 * the text came from a Growth Manager owner and was handled as an approval.
 */
export async function handleOwnerReply(location: Location & { business: Business }, fromRaw: string, body: string, now = new Date()) {
  const business = await prisma.business.findUnique({ where: { id: location.businessId }, include: { locations: true } });
  if (!business) return false;
  const s = await prisma.growthSettings.findUnique({ where: { businessId: business.id } });
  if (!s?.enabled) return false;
  const owner = ownerPhoneFor(s, business);
  const from = normalizePhone(fromRaw, business.country), ownerN = owner ? normalizePhone(owner, business.country) : null;
  if (!from || !ownerN || from !== ownerN) return false;
  const cmd = parseOwnerReply(body);
  if (!cmd) return false;

  const latest = await prisma.growthAction.findFirst({ where: { businessId: business.id, briefDate: { not: null } }, orderBy: { briefDate: "desc" }, select: { briefDate: true } });
  if (!latest?.briefDate) return false;
  const pending = await prisma.growthAction.findMany({ where: { businessId: business.id, briefDate: latest.briefDate, status: "PROPOSED" } });

  if (cmd.skip) {
    await prisma.growthAction.updateMany({ where: { id: { in: pending.map((a) => a.id) } }, data: { status: "SKIPPED" } });
    await sendToOwner(business, s, "OK, skipped today's suggestions. I'll check again tomorrow.");
    return true;
  }
  const chosen = pending.filter((a) => cmd.approve === "ALL" || (a.briefItem != null && (cmd.approve as number[]).includes(a.briefItem)));
  await prisma.growthAction.updateMany({ where: { id: { in: chosen.map((a) => a.id) } }, data: { status: "APPROVED" } });
  let done = 0, waiting = 0;
  for (const a of chosen.slice(0, 20)) {
    const r = await executeAction(a.id, now);
    if (r.status === "DONE") done++; else if (r.status === "DEFERRED") waiting++;
  }
  const parts = [`Approved ${chosen.length} action${chosen.length === 1 ? "" : "s"}.`];
  if (done) parts.push(`${done} done now.`);
  if (waiting) parts.push(`${waiting} will go out in contact hours.`);
  await sendToOwner(business, s, parts.join(" "));
  return true;
}

/** Monday report (once per ISO week). */
export async function sendWeeklyReport(businessId: string, now = new Date()) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId }, include: { locations: true } });
  const s = await getSettings(business);
  const week = isoWeek(localParts(now, s.timezone).date);
  if (s.lastReportWeek === week) return null;
  const st = await weekStats(businessId, now);
  const byType = await prisma.growthAction.groupBy({ by: ["type"], where: { businessId, status: "DONE", executedAt: { gte: new Date(now.getTime() - 7 * DAY) } }, _count: { _all: true } });
  const top = byType.sort((a, b) => b._count._all - a._count._all).slice(0, 3)
    .map((r) => { const l = ACTION_LABEL[r.type as ActionType]; if (!l) return null; const t = r._count._all === 1 ? l.one : l.many(r._count._all); return t.charAt(0).toLowerCase() + t.slice(1); }).filter(Boolean);
  const body = [
    `${firstLoc(business)?.smsSenderName || business.name} · your week with the Growth Manager`,
    `I took ${st.done} action${st.done === 1 ? "" : "s"}${top.length ? `: ${top.join(", ")}` : ""}.`,
    st.wins ? `${st.wins} customer${st.wins === 1 ? "" : "s"} booked or came back after, about ${money(s, st.value)} in revenue influenced.` : "No bookings traced back to them yet; I'll keep going.",
  ].join("\n");
  await sendToOwner(business, s, body);
  await prisma.growthSettings.update({ where: { businessId }, data: { lastReportWeek: week } });
  return body;
}
