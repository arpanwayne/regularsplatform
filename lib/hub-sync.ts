import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { withoutSync } from "@/lib/sync-context";
import { loopdeskApiUrl, hubWhatsAppReady } from "@/lib/whatsapp-sender";
import { signToolToken } from "@/lib/whatsapp-hub";
import { CUSTOMER_FIELDS, checkSyncBody, isDummyPhone, mergeIncoming, toSyncCustomer, toSyncMessage, type SyncCustomer, type SyncMessage } from "@/lib/customer-sync-rules";

/**
 * Loopdesk ⇄ Regulars customer sync (bug list 28 Nov 2026, A1/B5). Pankaj: keep
 * both databases, sync both ways. Rules: lib/customer-sync-rules.ts.
 *
 *   Regulars → Loopdesk   POST {LOOPDESK_API_URL}/api/hub/tools/regulars/sync
 *                         tool token (signToolToken), purpose "customer-sync",
 *                         sub = Loopdesk business id (Business.hubBusinessId)
 *                         { customers: SyncCustomer[] }  → { ok, created, updated }
 *   Loopdesk → Regulars   POST /api/hub/sync  (app/api/hub/sync)
 *                         hub token, purpose "customer-sync"
 *                         { customers, messages }  — messages = copies of what
 *                         Loopdesk sent itself, so both inboxes show the chat
 *
 * Messages Regulars sends go out through Loopdesk anyway (lib/whatsapp-hub.ts),
 * and messages for us come in through Loopdesk, so Loopdesk keeps its own copy
 * of those; we never send messages the other way.
 *
 * Only for businesses linked to Loopdesk (hubBusinessId). A failed push stays
 * pending and goes with the next flush (any customer change, or the hourly cron).
 */

let timer: ReturnType<typeof setTimeout> | null = null;
let running: Promise<unknown> | null = null;

/** A customer changed: send pending rows in ~2 s (many changes → one push). */
export function scheduleHubSync(delayMs = 2000) {
  if (!hubWhatsAppReady() || timer) return;
  timer = setTimeout(() => {
    timer = null;
    flushHubSync().catch(() => {});
  }, delayMs);
}

/** Sends every pending customer of linked businesses. Returns how many went. */
export async function flushHubSync(): Promise<{ sent: number; failed: number }> {
  if (running) {
    await running.catch(() => {});
    // A change during that run is picked up by its own schedule; run once more to be sure.
  }
  const p = doFlush();
  running = p;
  try { return await p; } finally { if (running === p) running = null; }
}

async function doFlush(): Promise<{ sent: number; failed: number }> {
  const api = loopdeskApiUrl();
  if (!api || !hubWhatsAppReady()) return { sent: 0, failed: 0 };
  let sent = 0, failed = 0;
  const skip = new Set<string>();
  for (let round = 0; round < 40; round++) {
    const startedAt = new Date();
    const notSkipped = skip.size ? { businessId: { notIn: Array.from(skip) } } : {};
    const linked = { business: { hubBusinessId: { not: null } } };
    const customers = await prisma.customer.findMany({
      where: { syncPending: true, ...linked, ...notSkipped },
      select: { ...CUSTOMER_FIELDS, id: true, businessId: true, business: { select: { hubBusinessId: true } } },
      orderBy: { syncChangedAt: "asc" },
      take: 500,
    });
    // Messages still being sent (no Meta id yet) wait for the next flush.
    const messages = await prisma.message.findMany({
      where: { syncPending: true, ...linked, ...notSkipped, OR: [{ status: { notIn: ["QUEUED", "SENDING"] } }, { status: null }, { createdAt: { lt: new Date(Date.now() - 120_000) } }] },
      select: { id: true, businessId: true, direction: true, channel: true, text: true, providerSid: true, status: true, purpose: true, createdAt: true, customer: { select: { phone: true } }, business: { select: { hubBusinessId: true } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    if (!customers.length && !messages.length) break;
    const groups = new Map<string, { businessId: string; customers: typeof customers; messages: typeof messages }>();
    const group = (hub: string, businessId: string) => {
      if (!groups.has(hub)) groups.set(hub, { businessId, customers: [], messages: [] });
      return groups.get(hub)!;
    };
    for (const c of customers) group(c.business.hubBusinessId!, c.businessId).customers.push(c);
    for (const m of messages) group(m.business.hubBusinessId!, m.businessId).messages.push(m);

    for (const [hubBusinessId, g] of Array.from(groups.entries())) {
      const body = {
        customers: g.customers.map(toSyncCustomer).filter((c): c is SyncCustomer => !!c),
        messages: g.messages.map(toSyncMessage).filter((m): m is SyncMessage => !!m),
      };
      try {
        if (body.customers.length || body.messages.length) {
          const res = await fetch(`${api}/api/hub/tools/regulars/sync`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${await signToolToken(hubBusinessId, "customer-sync")}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`);
        }
        await withoutSync(async () => {
          // Rows changed again during the push stay pending.
          if (g.customers.length) await prisma.customer.updateMany({ where: { id: { in: g.customers.map((r) => r.id) }, OR: [{ syncChangedAt: { lte: startedAt } }, { syncChangedAt: null }] }, data: { syncPending: false } });
          if (g.messages.length) await prisma.message.updateMany({ where: { id: { in: g.messages.map((r) => r.id) } }, data: { syncPending: false } });
        });
        sent += body.customers.length + body.messages.length;
      } catch (err) {
        failed += g.customers.length + g.messages.length;
        skip.add(g.businessId);
        await logEvent({ businessId: g.businessId, source: "API", level: "WARN", message: "Could not sync customers to Loopdesk AI (will retry)", meta: { error: err instanceof Error ? err.message : String(err), customers: g.customers.length, messages: g.messages.length } });
      }
    }
    if (customers.length < 500 && messages.length < 500) break;
  }
  return { sent, failed };
}

/**
 * Loopdesk's customers / messages → this business. Writes here are not marked
 * for sending back (withoutSync). Returns counts for the response.
 */
export async function applyHubSync(businessId: string, body: unknown) {
  const { customers, messages } = checkSyncBody(body);
  const business = await prisma.business.findUnique({ where: { id: businessId }, include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } } });
  const first = business?.locations[0];
  if (!business || !first) throw new Error("Business has no location");
  let created = 0, updated = 0, stored = 0;

  await withoutSync(async () => {
    const byPhone = async (phone: string) => prisma.customer.findFirst({
      where: { businessId, phone: { in: [phone, `+${phone}`] } },
      orderBy: { firstSeenAt: "asc" },
    });
    for (const inc of customers) {
      const local = await byPhone(inc.phone);
      const merged = mergeIncoming(local, inc);
      if (!merged) continue;
      if ("create" in merged) {
        await prisma.customer.create({ data: { businessId, locationId: first.id, phone: inc.phone, ...merged.create, syncChangedAt: new Date(inc.changedAt) } }).catch((err) => {
          if (String((err as { code?: string })?.code) !== "P2002") throw err; // created meanwhile
        });
        created++;
      } else {
        await prisma.customer.update({ where: { id: local!.id }, data: { ...merged.update, syncChangedAt: new Date(inc.changedAt) } });
        updated++;
      }
    }
    for (const m of messages) {
      let customer = await byPhone(m.phone);
      if (!customer) {
        // A message for someone whose customer row hasn't arrived yet: hold
        // marketing (PENDING) until the real row says otherwise.
        customer = await prisma.customer.create({ data: { businessId, locationId: first.id, phone: m.phone, consentStatus: "PENDING", consentSource: "MANAGER" } }).catch(() => null)
          ?? await byPhone(m.phone);
        if (!customer) continue;
      }
      const providerSid = m.providerSid || `mirror:${m.id}`;
      const at = new Date(m.createdAt);
      const r = await prisma.message.create({
        data: {
          businessId, locationId: customer.locationId, customerId: customer.id, direction: m.direction, channel: m.channel || "WHATSAPP",
          purpose: m.purpose ?? (m.direction === "INBOUND" ? "REPLY" : "OTHER"), status: m.status, providerSid, text: m.text,
          createdAt: at, readAt: m.direction === "OUTBOUND" ? at : null, syncOrigin: "loopdesk",
        },
      }).catch((err) => {
        if (String((err as { code?: string })?.code) === "P2002") return null; // already have it
        throw err;
      });
      if (r) stored++;
    }
  });
  return { created, updated, stored };
}

/** Which Loopdesk business a Regulars QR join code belongs to (A3: Loopdesk asks before routing a JOIN). */
export async function hubBusinessForJoinCode(code: string): Promise<string | null> {
  const c = String(code ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(c)) return null;
  const loc = await prisma.location.findFirst({ where: { joinCode: c }, select: { business: { select: { hubBusinessId: true, status: true } } } });
  return loc?.business.hubBusinessId && loc.business.status !== "SUSPENDED" ? loc.business.hubBusinessId : null;
}

/**
 * Marks every customer of linked businesses for sending (first sync after
 * deploy), and their last 30 days of messages. Dummy numbers skipped.
 */
export async function markAllForHubSync(businessId?: string) {
  const rows = await prisma.customer.findMany({ where: { business: { hubBusinessId: { not: null } }, ...(businessId ? { businessId } : {}) }, select: { id: true, phone: true } });
  const ids = rows.filter((r) => !isDummyPhone(r.phone)).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 1000) {
    await withoutSync(() => prisma.customer.updateMany({ where: { id: { in: ids.slice(i, i + 1000) } }, data: { syncPending: true } }));
    await withoutSync(() => prisma.message.updateMany({
      where: { customerId: { in: ids.slice(i, i + 1000) }, syncOrigin: null, channel: { not: "INSTAGRAM" }, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
      data: { syncPending: true },
    }));
  }
  return ids.length;
}
