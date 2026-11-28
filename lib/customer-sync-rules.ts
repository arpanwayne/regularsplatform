/**
 * Customer sync between Loopdesk AI and Regulars (bug list 28 Nov 2026, A1/B5).
 *
 * Pankaj (28 Nov): keep both databases, sync customers both ways. This file is
 * the same in both repos (lib/customer-sync-rules.ts) — change it in both.
 *
 * Every customer write that touches one of SYNC_FIELDS marks the row
 * syncPending (lib/prisma.ts). A flush a few seconds later sends the pending
 * rows to the other app, which merges them with mergeIncoming. Writes made by
 * the merge itself are not marked, so nothing echoes back.
 *
 * Merge rules (pure, unit-tested):
 *  - new phone → created on the first location;
 *  - name: fills an empty name, or replaces it when the other side changed it later;
 *  - STOP always wins and is never cleared by sync (START goes through the
 *    opt-in calls, which the business owner or the person triggers);
 *  - consent: an answer (GRANTED / DECLINED) beats IMPLIED beats PENDING;
 *    same level → the later change wins (YES then NO = NO);
 *  - QR tag fills an empty one.
 */

export const SYNC_FIELDS = ["phone", "name", "optedOut", "optedOutAt", "consentStatus", "consentSource", "consentAt", "joinTag"] as const;

export type SyncCustomer = {
  phone: string;
  name: string | null;
  optedOut: boolean;
  optedOutAt: string | null;
  consentStatus: string;
  consentSource: string | null;
  consentAt: string | null;
  joinTag: string | null;
  firstSeenAt: string;
  changedAt: string;
};

export type SyncMessage = {
  /** Sender's own message id, so a mirrored copy is stored once. */
  id: string;
  phone: string;
  direction: "INBOUND" | "OUTBOUND";
  channel: string;
  text: string | null;
  providerSid: string | null;
  status: string | null;
  purpose: string | null;
  createdAt: string;
};

export type SyncBody = { customers?: SyncCustomer[]; messages?: SyncMessage[] };

export type LocalCustomer = {
  name: string | null;
  optedOut: boolean;
  consentStatus: string;
  consentSource: string | null;
  consentAt: Date | null;
  joinTag: string | null;
  syncChangedAt: Date | null;
};

/** Does a Prisma write's data touch a synced field? */
export function touchesSyncFields(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  return SYNC_FIELDS.some((k) => k in (data as Record<string, unknown>));
}

/** Digits only, 10–15 long; null for Instagram-only ("ig:…") and junk. */
export function syncPhone(phone: string | null | undefined): string | null {
  const p = String(phone ?? "");
  if (p.startsWith("ig:")) return null;
  const d = p.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 15 ? d : null;
}

/**
 * Test numbers that must never reach a real business (A4: +91 98000 000xx —
 * Aman, Simran, Karan, Rohit, Neha in Wayne E Solutions).
 */
export function isDummyPhone(phone: string | null | undefined): boolean {
  const d = String(phone ?? "").replace(/\D/g, "");
  return /^(91)?98000000\d\d$/.test(d);
}

const RANK: Record<string, number> = { PENDING: 0, IMPLIED: 1, GRANTED: 2, DECLINED: 2 };
const rank = (s: string | null | undefined) => RANK[String(s ?? "")] ?? 0;
const time = (s: string | Date | null | undefined) => (s ? new Date(s).getTime() : 0);

/**
 * What to write locally for one incoming customer. null = nothing changes.
 * For a phone we don't have yet, the caller creates the row from `create`.
 */
export function mergeIncoming(local: LocalCustomer | null, inc: SyncCustomer): { create: Record<string, unknown> } | { update: Record<string, unknown> } | null {
  if (!local) {
    return {
      create: {
        name: inc.name || null,
        optedOut: inc.optedOut,
        optedOutAt: inc.optedOut ? (inc.optedOutAt ? new Date(inc.optedOutAt) : new Date(inc.changedAt)) : null,
        consentStatus: RANK[inc.consentStatus] === undefined ? "PENDING" : inc.consentStatus,
        consentSource: inc.consentSource,
        consentAt: inc.consentAt ? new Date(inc.consentAt) : null,
        joinTag: inc.joinTag,
        firstSeenAt: new Date(inc.firstSeenAt),
      },
    };
  }
  const later = time(inc.changedAt) > time(local.syncChangedAt);
  const patch: Record<string, unknown> = {};
  if (inc.name && inc.name !== local.name && (!local.name || later)) patch.name = inc.name;
  if (inc.optedOut && !local.optedOut) {
    patch.optedOut = true;
    patch.optedOutAt = inc.optedOutAt ? new Date(inc.optedOutAt) : new Date(inc.changedAt);
  }
  if (RANK[inc.consentStatus] !== undefined && inc.consentStatus !== local.consentStatus) {
    const a = rank(inc.consentStatus), b = rank(local.consentStatus);
    if (a > b || (a === b && later)) {
      patch.consentStatus = inc.consentStatus;
      patch.consentSource = inc.consentSource;
      patch.consentAt = inc.consentAt ? new Date(inc.consentAt) : null;
    }
  }
  if (inc.joinTag && !local.joinTag) patch.joinTag = inc.joinTag;
  return Object.keys(patch).length ? { update: patch } : null;
}

/** A customer row → what we send. */
export function toSyncCustomer(c: {
  phone: string; name: string | null; optedOut: boolean; optedOutAt: Date | null; consentStatus: string; consentSource: string | null;
  consentAt: Date | null; joinTag: string | null; firstSeenAt: Date; syncChangedAt: Date | null;
}): SyncCustomer | null {
  const phone = syncPhone(c.phone);
  if (!phone || isDummyPhone(phone)) return null;
  return {
    phone,
    name: c.name,
    optedOut: c.optedOut,
    optedOutAt: c.optedOutAt?.toISOString() ?? null,
    consentStatus: c.consentStatus,
    consentSource: c.consentSource,
    consentAt: c.consentAt?.toISOString() ?? null,
    joinTag: c.joinTag,
    firstSeenAt: c.firstSeenAt.toISOString(),
    // Never changed since the sync started: as old as the row, so it only fills gaps.
    changedAt: (c.syncChangedAt ?? c.firstSeenAt).toISOString(),
  };
}

/** Prisma select for toSyncCustomer. */
export const CUSTOMER_FIELDS = {
  phone: true, name: true, optedOut: true, optedOutAt: true, consentStatus: true, consentSource: true, consentAt: true,
  joinTag: true, firstSeenAt: true, syncChangedAt: true,
} as const;

/** A message row → what we send (null = not sendable, e.g. Instagram-only person). */
export function toSyncMessage(m: {
  id: string; direction: string; channel: string; text: string | null; providerSid: string | null; status: string | null;
  purpose: string | null; createdAt: Date; customer: { phone: string };
}): SyncMessage | null {
  const phone = syncPhone(m.customer.phone);
  if (!phone || isDummyPhone(phone) || (m.direction !== "INBOUND" && m.direction !== "OUTBOUND")) return null;
  return {
    id: m.id, phone, direction: m.direction, channel: m.channel, text: m.text, providerSid: m.providerSid,
    status: m.status, purpose: m.purpose, createdAt: m.createdAt.toISOString(),
  };
}

/** Checks a sync body from the other app (shape only; ≤ 500 of each). */
export function checkSyncBody(body: unknown): { customers: SyncCustomer[]; messages: SyncMessage[] } {
  const b = (body ?? {}) as SyncBody;
  const customers = (Array.isArray(b.customers) ? b.customers : []).slice(0, 500).filter((c) =>
    c && typeof c === "object" && !!syncPhone(c.phone) && !isDummyPhone(c.phone) && typeof c.optedOut === "boolean"
    && typeof c.consentStatus === "string" && !Number.isNaN(time(c.changedAt)) && !Number.isNaN(time(c.firstSeenAt)),
  ).map((c) => ({ ...c, phone: syncPhone(c.phone)!, name: typeof c.name === "string" ? c.name.slice(0, 120) : null }));
  const messages = (Array.isArray(b.messages) ? b.messages : []).slice(0, 500).filter((m) =>
    m && typeof m === "object" && typeof m.id === "string" && !!syncPhone(m.phone) && !isDummyPhone(m.phone)
    && (m.direction === "INBOUND" || m.direction === "OUTBOUND") && !Number.isNaN(time(m.createdAt)),
  ).map((m) => ({ ...m, phone: syncPhone(m.phone)!, text: typeof m.text === "string" ? m.text.slice(0, 4096) : null }));
  return { customers, messages };
}
