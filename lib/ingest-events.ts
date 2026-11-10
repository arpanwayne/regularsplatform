import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { sendReviewRequest } from "@/lib/front-desk";

/**
 * Inbound events from another system (POST /api/v1/events).
 *
 * Fixes the gap where a visit only counted when the customer happened to type
 * "booking"/"appointment" on WhatsApp: a clinic, salon or POS system that
 * knows a real visit happened reports it here.
 *
 *  - VISIT:    a real visit. Needs externalId (idempotency — a retried push is
 *              reported as "duplicate", never double-counted). Optional amount
 *              feeds totalSpend, so High Spender can finally trigger.
 *  - CUSTOMER: create/refresh a customer profile without counting a visit.
 *  - OPT_OUT:  the customer must not be targeted by calling scripts again.
 */

export const eventSchema = z.object({
  type: z.enum(["VISIT", "CUSTOMER", "OPT_OUT"]),
  // International format, digits only after stripping (country code included),
  // to match the WhatsApp wa_id that webhook-captured customers are keyed by.
  phone: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => /^\d{11,15}$/.test(v), "phone must include the country code (11–15 digits), e.g. 919876543210"),
  name: z.string().trim().min(1).max(100).optional(),
  occurredAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .refine((v) => !v || new Date(v).getTime() <= Date.now() + 5 * 60_000, "occurredAt cannot be in the future"),
  amount: z.number().min(0).max(10_000_000).optional(),
  externalId: z.string().trim().min(1).max(100).optional(),
  locationId: z.string().optional(),
});

export const batchSchema = z.object({
  events: z.array(z.unknown()).min(1).max(100),
});

export type InboundEvent = z.infer<typeof eventSchema>;

export type EventResult =
  | { index: number; status: "created" | "updated" | "duplicate"; customerId: string }
  | { index: number; status: "rejected"; error: string };

type BusinessWithLocations = {
  id: string;
  locations: { id: string; status: string }[];
};

function resolveLocationId(business: BusinessWithLocations, requested?: string) {
  if (requested) {
    const loc = business.locations.find((l) => l.id === requested);
    if (!loc) throw new Error("locationId does not belong to this business");
    return loc.id;
  }
  const loc = business.locations.find((l) => l.status === "ACTIVE") ?? business.locations[0];
  if (!loc) throw new Error("business has no locations");
  return loc.id;
}

async function applyEvent(business: BusinessWithLocations, ev: InboundEvent, source: string) {
  const locationId = resolveLocationId(business, ev.locationId);
  const at = ev.occurredAt ? new Date(ev.occurredAt) : new Date();

  if (ev.type === "VISIT") {
    if (!ev.externalId) throw new Error("externalId is required for VISIT events");
    const existing = await prisma.visit.findUnique({
      where: { businessId_externalId: { businessId: business.id, externalId: ev.externalId } },
      select: { customerId: true },
    });
    if (existing) return { status: "duplicate" as const, customerId: existing.customerId };

    return prisma.$transaction(async (tx) => {
      const current = await tx.customer.findUnique({ where: { locationId_phone: { locationId, phone: ev.phone } } });
      const customer = current
        ? await tx.customer.update({
            where: { id: current.id },
            data: {
              name: ev.name ?? undefined,
              visitCount: { increment: 1 },
              totalSpend: { increment: ev.amount ?? 0 },
              // Events can arrive out of order (backfills) — keep the extremes.
              lastSeenAt: at > current.lastSeenAt ? at : undefined,
              firstSeenAt: at < current.firstSeenAt ? at : undefined,
            },
          })
        : await tx.customer.create({
            data: {
              businessId: business.id,
              locationId,
              phone: ev.phone,
              name: ev.name ?? null,
              firstSeenAt: at,
              lastSeenAt: at,
              visitCount: 1,
              totalSpend: ev.amount ?? 0,
            },
          });
      await tx.visit.create({
        data: {
          businessId: business.id,
          locationId,
          customerId: customer.id,
          amount: ev.amount ?? null,
          occurredAt: at,
          source,
          externalId: ev.externalId,
        },
      });
      return { status: current ? ("updated" as const) : ("created" as const), customerId: customer.id };
    });
  }

  const existing = await prisma.customer.findUnique({ where: { locationId_phone: { locationId, phone: ev.phone } } });
  const optOut = ev.type === "OPT_OUT";
  if (existing) {
    const updated = await prisma.customer.update({
      where: { id: existing.id },
      data: {
        name: ev.name ?? undefined,
        ...(optOut && !existing.optedOut ? { optedOut: true, optedOutAt: new Date() } : {}),
      },
    });
    return { status: "updated" as const, customerId: updated.id };
  }
  const created = await prisma.customer.create({
    data: {
      businessId: business.id,
      locationId,
      phone: ev.phone,
      name: ev.name ?? null,
      firstSeenAt: at,
      lastSeenAt: at,
      optedOut: optOut,
      optedOutAt: optOut ? new Date() : null,
    },
  });
  return { status: "created" as const, customerId: created.id };
}

/** Applies a batch; one bad event never fails the others. Re-segments once at the end. */
export async function ingestEvents(business: BusinessWithLocations, rawEvents: unknown[], source: string) {
  const results: EventResult[] = [];
  let changed = false;

  for (let index = 0; index < rawEvents.length; index++) {
    const parsed = eventSchema.safeParse(rawEvents[index]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      results.push({ index, status: "rejected", error: `${issue.path.join(".") || "event"}: ${issue.message}` });
      continue;
    }
    try {
      const r = await applyEvent(business, parsed.data, source);
      if (r.status !== "duplicate") changed = true;
      results.push({ index, ...r });
    } catch (err) {
      // Lost a race with a concurrent push of the same externalId.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        results.push({ index, status: "rejected", error: "duplicate (concurrent request)" });
      } else {
        results.push({ index, status: "rejected", error: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  if (changed) await runSegmentationForBusiness(business.id);

  // Front Desk: "after the visit, a thank-you SMS asks for a Google review".
  const fullBusiness = await prisma.business.findUnique({ where: { id: business.id } });
  if (fullBusiness?.autoReviewRequest && fullBusiness.status === "ACTIVE") {
    for (const [i, r] of results.entries()) {
      const ev = rawEvents[i] as { type?: string };
      if (ev?.type !== "VISIT" || r.status === "rejected" || r.status === "duplicate") continue;
      const customer = await prisma.customer.findUnique({ where: { id: r.customerId }, include: { location: true } });
      if (customer) await sendReviewRequest(fullBusiness, customer.location, customer).catch(() => null);
    }
  }

  const count = (s: string) => results.filter((r) => r.status === s).length;
  return {
    summary: { created: count("created"), updated: count("updated"), duplicate: count("duplicate"), rejected: count("rejected") },
    results,
  };
}
