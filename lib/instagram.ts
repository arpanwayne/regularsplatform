import type { Business, Customer, Location } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import type { SendResult } from "@/lib/sms";
import type { MessagePurpose } from "@/lib/types";

export * from "@/lib/instagram-shared";

/**
 * Instagram DMs → booking (Loopdesk add-on, Nov 2026).
 *
 * A location connects its Instagram professional account (Settings). Every
 * DM then lands in the Regulars inbox like a WhatsApp or SMS message, the
 * owner gets the usual "new customer message" alert, and a DM that asks to
 * book ("can I book for Saturday?", "appointment milega?") gets the
 * location's booking link straight away.
 *
 * Works with both Meta set-ups (INSTAGRAM_LOGIN):
 *  - "unified" (default): Instagram API with Unified Login — the only one
 *    Meta offers new apps since late Oct 2026. graph.facebook.com, a
 *    Business Integration System User token (doesn't expire), permission
 *    instagram_manage_messages.
 *  - "instagram": Instagram API with Instagram Login (older apps).
 *    graph.instagram.com, an Instagram user token (60 days, refreshed).
 * Same webhook payload and app-secret signature in both. Meta
 * only allows a reply within 24 hours of the person's last message, and
 * never a cold/marketing DM, so Instagram customers are never part of
 * win-backs, reminders or SMS.
 */

export type IgLogin = "unified" | "instagram";
/** Which Meta set-up the app uses. New Meta apps only get Unified login. */
export const igLogin = (): IgLogin => (process.env.INSTAGRAM_LOGIN === "instagram" ? "instagram" : "unified");
/** API host + version for the set-up. */
export const igGraph = (mode: IgLogin = igLogin()) =>
  mode === "instagram" ? "https://graph.instagram.com/v21.0" : `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v26.0"}`;
const WINDOW_MS = 24 * 60 * 60 * 1000;
/** Send the booking link at most once per person in this time. */
export const BOOKING_REPLY_EVERY_MS = 12 * 60 * 60 * 1000;

/**
 * The add-on is switched on per business by a super admin (Admin →
 * Businesses → "Instagram DMs"), because it is sold on top of the plan.
 */
export function instagramAllowed(b: Pick<Business, "instagramAddon" | "status">): boolean {
  return b.instagramAddon && b.status !== "SUSPENDED";
}

export function instagramConnected(l: Pick<Location, "instagramAccountId" | "instagramAccessToken"> | null | undefined): boolean {
  return !!l?.instagramAccountId && !!l.instagramAccessToken;
}

/** Same check as WhatsApp's: Meta signs the body with the app secret. */
export async function verifyInstagramSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const appSecret = process.env.INSTAGRAM_APP_SECRET || process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) return process.env.NODE_ENV !== "production"; // never accept unsigned events on a live server
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expectedHex = signatureHeader.slice("sha256=".length);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actualHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (actualHex.length !== expectedHex.length) return false;
  let mismatch = 0;
  for (let i = 0; i < actualHex.length; i++) mismatch |= actualHex.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return mismatch === 0;
}

// ── Graph API ────────────────────────────────────────────────────────────

type Fetch = typeof fetch;

/** @username for an Instagram user id. Best effort: null when Meta won't say. */
export async function fetchInstagramUsername(location: Location, igsid: string, f: Fetch = fetch): Promise<string | null> {
  if (!location.instagramAccessToken) return null;
  try {
    const res = await f(`${igGraph()}/${encodeURIComponent(igsid)}?fields=username,name`, {
      headers: { authorization: `Bearer ${location.instagramAccessToken}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: string };
    return data.username ?? null;
  } catch {
    return null;
  }
}

/** When this person last wrote to us on Instagram (opens Meta's 24h reply window). */
export async function lastInboundInstagram(customerId: string) {
  const m = await prisma.message.findFirst({
    where: { customerId, channel: "INSTAGRAM", direction: "INBOUND" },
    orderBy: { createdAt: "desc" }, select: { createdAt: true },
  });
  return m?.createdAt ?? null;
}

export const instagramWindowOpen = (lastInbound: Date | null, now = new Date()) =>
  !!lastInbound && now.getTime() - lastInbound.getTime() < WINDOW_MS;

/**
 * Sends one Instagram DM to a customer and records it in the conversation.
 * Only inside the 24h window — Meta refuses anything else.
 */
export async function sendCustomerInstagram(p: {
  business: Business; location: Location; customer: Customer; text: string; purpose: MessagePurpose;
  now?: Date; fetchImpl?: Fetch;
}): Promise<SendResult> {
  const { business, location, customer, purpose } = p;
  const f = p.fetchImpl ?? fetch;
  if (business.status === "SUSPENDED" || location.status === "SUSPENDED") return { ok: false, status: "SUSPENDED" };
  if (!instagramConnected(location) || !customer.instagramId) return { ok: false, status: "NO_NUMBER", error: "INSTAGRAM_NOT_CONNECTED: This location has no Instagram account connected." };
  if (!instagramWindowOpen(await lastInboundInstagram(customer.id), p.now)) {
    return { ok: false, status: "FAILED", error: "WINDOW_CLOSED: Instagram only allows a reply within 24 hours of the customer's last message." };
  }

  const text = p.text.slice(0, 1000);
  let mid: string | null = null;
  let error: string | null = null;
  try {
    const res = await f(`${igGraph()}/${encodeURIComponent(location.instagramAccountId!)}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${location.instagramAccessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ recipient: { id: customer.instagramId }, message: { text } }),
    });
    const data = (await res.json().catch(() => ({}))) as { message_id?: string; error?: { message?: string; code?: number } };
    if (res.ok && data.message_id) mid = data.message_id;
    else error = data.error?.message ?? `HTTP ${res.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const msg = await prisma.message.create({
    data: {
      businessId: business.id, locationId: location.id, customerId: customer.id,
      direction: "OUTBOUND", channel: "INSTAGRAM", purpose, status: mid ? "SENT" : "FAILED",
      providerSid: mid, text, rawPayload: JSON.stringify({ error }),
    },
  });
  if (mid) {
    await prisma.usageEvent.create({ data: { businessId: business.id, type: "INSTAGRAM_SENT" } });
    return { ok: true, status: "SENT", messageId: msg.id, segments: 0 };
  }
  await logEvent({ businessId: business.id, source: "INSTAGRAM", level: "ERROR", message: "Instagram DM failed", meta: { customerId: customer.id, purpose, error } });
  return { ok: false, status: "FAILED", error: error ?? "Instagram DM failed" };
}

// ── Token refresh ────────────────────────────────────────────────────────

/** Refresh a token this often (they expire after 60 days unused-refresh). */
export const TOKEN_REFRESH_EVERY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Long-lived Instagram tokens expire after 60 days, and then DMs silently
 * stop. Called from the hourly cron: refreshes any token older than a week.
 */
export async function refreshInstagramTokens(now = new Date(), f: Fetch = fetch) {
  // Unified login tokens (Business Integration System User) don't expire.
  if (igLogin() !== "instagram") return { checked: 0, refreshed: 0, skipped: "unified login tokens don't expire" };
  const due = await prisma.location.findMany({
    where: {
      instagramAccountId: { not: null }, instagramAccessToken: { not: null },
      OR: [{ instagramTokenRefreshedAt: null }, { instagramTokenRefreshedAt: { lt: new Date(now.getTime() - TOKEN_REFRESH_EVERY_MS) } }],
    },
    select: { id: true, businessId: true, instagramAccessToken: true },
    take: 50,
  });
  let refreshed = 0;
  for (const l of due) {
    try {
      const res = await f(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(l.instagramAccessToken!)}`);
      const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: { message?: string } };
      if (res.ok && data.access_token) {
        await prisma.location.update({ where: { id: l.id }, data: { instagramAccessToken: data.access_token, instagramTokenRefreshedAt: now } });
        refreshed++;
      } else {
        // Try again next week rather than every hour; the log tells the admin to reconnect.
        await prisma.location.update({ where: { id: l.id }, data: { instagramTokenRefreshedAt: now } });
        await logEvent({ businessId: l.businessId, source: "INSTAGRAM", level: "WARN", message: "Instagram token could not be refreshed — reconnect Instagram in Settings before it expires", meta: { locationId: l.id, error: data.error?.message ?? `HTTP ${res.status}` } });
      }
    } catch (err) {
      await logEvent({ businessId: l.businessId, source: "INSTAGRAM", level: "WARN", message: "Instagram token refresh failed", meta: { locationId: l.id, error: err instanceof Error ? err.message : String(err) } });
    }
  }
  return { checked: due.length, refreshed };
}

// ── Webhook subscription ─────────────────────────────────────────────────

/**
 * Meta only sends an account's DMs to our webhook after the app is
 * subscribed on that account. Called when Settings saves the account ID or
 * token. Returns a readable error, or null when it worked.
 */
export async function subscribeInstagramWebhooks(
  location: Pick<Location, "instagramAccountId" | "instagramAccessToken">, f: Fetch = fetch,
): Promise<string | null> {
  if (!location.instagramAccountId || !location.instagramAccessToken) return "Instagram account ID and token are both needed";
  try {
    const url = `${igGraph()}/${encodeURIComponent(location.instagramAccountId)}/subscribed_apps?subscribed_fields=messages`;
    const res = await f(url, { method: "POST", headers: { authorization: `Bearer ${location.instagramAccessToken}` } });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string; code?: number } };
    if (res.ok && data.success !== false) return null;
    return data.error?.message ?? `Meta answered HTTP ${res.status}`;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
