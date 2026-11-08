import { Prisma } from "@prisma/client";
import type { Business, Location } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";
import { ingestEvents } from "@/lib/ingest-events";
import { ATTRIBUTION_WINDOW_DAYS, CONVERSION_EVENTS, EVENT_TYPES, VISIT_EVENTS, type GrowthEventType } from "@/lib/growth/types";
import { DAY, getSettings, parseJson } from "@/lib/growth/settings";

/**
 * WATCH + MEASURE: the customer timeline.
 *
 * Every product reports what happened (POST /api/v1/growth/events):
 *   WayneRing   CALL_ANSWERED · CALL_MISSED · CALLBACK_ANSWERED · …
 *   Field CRM   QUOTE_SENT · QUOTE_ACCEPTED · JOB_DONE · INVOICE_PAID
 *   GMB Manager REVIEW_RECEIVED
 *   POS/booking BOOKING · VISIT
 * Regulars itself adds MESSAGE_IN when a customer texts.
 *
 * A conversion event (booking, accepted quote, job, payment, visit) credits
 * the most recent GrowthAction that touched the same customer within 14 days
 * — "revenue influenced by the AI", last-touch.
 */

export const growthEventSchema = z.object({
  type: z.enum(EVENT_TYPES),
  phone: z.string().min(5).max(30).optional(),
  name: z.string().trim().min(1).max(100).optional(),
  locationId: z.string().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  value: z.number().min(0).max(100_000_000).optional(),
  ref: z.string().trim().max(200).optional(),
  externalId: z.string().trim().min(1).max(200),
  actionId: z.string().max(100).optional(),
  data: z.record(z.unknown()).optional(),
});
export type GrowthEventInput = z.infer<typeof growthEventSchema>;

type Result = { index: number; status: "created" | "duplicate" | "rejected"; id?: string; error?: string; attributedTo?: string };

export async function ingestGrowthEvents(
  business: Business & { locations: Location[] },
  raw: unknown[],
  source: string,
  now = new Date(),
) {
  const results: Result[] = [];
  const settings = await getSettings(business);
  for (let index = 0; index < raw.length; index++) {
    const parsed = growthEventSchema.safeParse(raw[index]);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      results.push({ index, status: "rejected", error: `${i.path.join(".") || "event"}: ${i.message}` });
      continue;
    }
    const ev = parsed.data;
    try {
      const existing = await prisma.growthEvent.findFirst({ where: { businessId: business.id, externalId: ev.externalId } });
      if (existing) { results.push({ index, status: "duplicate", id: existing.id }); continue; }

      const location = ev.locationId
        ? business.locations.find((l) => l.id === ev.locationId)
        : business.locations.find((l) => l.status === "ACTIVE") ?? business.locations[0];
      if (!location) throw new Error("No location for this business");

      let customerId: string | null = null;
      if (ev.phone) {
        const phone = normalizePhone(ev.phone, business.country);
        if (!phone) throw new Error("phone is not a valid number");
        const c = await prisma.customer.upsert({
          where: { locationId_phone: { locationId: location.id, phone } },
          create: { businessId: business.id, locationId: location.id, phone, name: ev.name ?? null },
          update: { lastSeenAt: now, ...(ev.name ? { name: ev.name } : {}) },
        });
        customerId = c.id;
        // Real visits also feed segmentation (visit count, spend, recency).
        if (VISIT_EVENTS.includes(ev.type)) {
          await ingestEvents(business, [{
            type: "VISIT", phone, name: ev.name, amount: ev.value, locationId: location.id,
            occurredAt: ev.occurredAt, externalId: `growth:${ev.externalId}`.slice(0, 100),
          }], source);
        }
      }

      const occurredAt = ev.occurredAt ? new Date(ev.occurredAt) : now;
      const created = await prisma.growthEvent.create({
        data: {
          businessId: business.id, locationId: location.id, customerId, type: ev.type, occurredAt,
          value: ev.value ?? null, ref: ev.ref ?? null, externalId: ev.externalId, actionId: ev.actionId ?? null,
          data: ev.data ? JSON.stringify(ev.data).slice(0, 8000) : null, source,
        },
      });
      const credited = await attribute(created, settings.avgJobValue);
      results.push({ index, status: "created", id: created.id, attributedTo: credited ?? undefined });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        results.push({ index, status: "duplicate" });
      } else {
        results.push({ index, status: "rejected", error: err instanceof Error ? err.message : String(err) });
      }
    }
  }
  const count = (s: string) => results.filter((r) => r.status === s).length;
  return { summary: { created: count("created"), duplicate: count("duplicate"), rejected: count("rejected") }, results };
}

/**
 * Credits a conversion to the last DONE action that touched this customer in
 * the attribution window. Returns the action id, or null.
 */
export async function attribute(
  ev: { id: string; businessId: string; customerId: string | null; type: string; occurredAt: Date; value: number | null; ref: string | null },
  avgJobValue: number,
) {
  if (!ev.customerId || !CONVERSION_EVENTS.includes(ev.type as GrowthEventType)) return null;
  const since = new Date(ev.occurredAt.getTime() - ATTRIBUTION_WINDOW_DAYS * DAY);
  const candidates = await prisma.growthAction.findMany({
    where: { businessId: ev.businessId, customerId: ev.customerId, status: "DONE", outcome: null, executedAt: { gte: since } },
    orderBy: { executedAt: "desc" },
    take: 5,
  });
  const action = candidates.find((a) => a.executedAt && a.executedAt <= ev.occurredAt);
  if (!action) return null;
  const payload = parseJson<{ quoteValue?: number }>(action.payload, {});
  const value = ev.value ?? payload.quoteValue ?? avgJobValue;
  await prisma.growthAction.update({ where: { id: action.id }, data: { outcome: "WON", outcomeValue: value, outcomeAt: ev.occurredAt } });
  await prisma.growthEvent.update({ where: { id: ev.id }, data: { attributedActionId: action.id } });
  return action.id;
}
