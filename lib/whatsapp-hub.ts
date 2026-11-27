import { SignJWT } from "jose";
import { randomUUID } from "crypto";
import { loopdeskApiUrl } from "@/lib/whatsapp-sender";

/**
 * Bundle clients send WhatsApp through Loopdesk AI, from the bundle's one
 * number (Regulars retest list, 27 Nov 2026: "one number for the whole
 * bundle"). Regulars keeps its own database; only the sending and the
 * receiving go through Loopdesk.
 *
 *   Regulars → Loopdesk   POST {LOOPDESK_API_URL}/api/hub/tools/regulars/whatsapp/send
 *                         Bearer HS256 JWT, secret HUB_SECRET (Loopdesk: HUB_SECRET_REGULARS)
 *                         iss "regulars"  aud "regulars-hub"  sub <Loopdesk business id>
 *                         purpose "whatsapp-send"  jti  exp 2 min
 *                         { to, message }  (WhatsApp Cloud API text | template)
 *                         → { messageId }  |  { error: { code, message, metaCode? } }
 *   Regulars → Loopdesk   POST …/whatsapp/opt-in  { to, optIn }  (STOP said here)
 *   Loopdesk → Regulars   POST /api/hub/whatsapp/inbound  (app/api/hub/whatsapp/inbound)
 */

export const TOOL_ISSUER = "regulars";
export const HUB_AUDIENCE_FOR_TOOLS = "regulars-hub";

export async function signToolToken(hubBusinessId: string, purpose: string, secret = process.env.HUB_SECRET ?? "") {
  return new SignJWT({ purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(TOOL_ISSUER)
    .setAudience(HUB_AUDIENCE_FOR_TOOLS)
    .setSubject(hubBusinessId)
    .setJti(randomUUID())
    .setIssuedAt()
    .setExpirationTime("2m")
    .sign(new TextEncoder().encode(secret));
}

export type HubSendResult = { ok: boolean; id: string | null; error?: string; code?: number };

/** Loopdesk's answer → the same shape graphSend returns (code = Meta's, so template fallback still works). */
export function hubAnswer(status: number, data: unknown): HubSendResult {
  const d = (data ?? {}) as { messageId?: unknown; error?: { code?: string; message?: string; metaCode?: number } };
  if (status >= 200 && status < 300 && typeof d.messageId === "string") return { ok: true, id: d.messageId };
  const e = d.error ?? {};
  return { ok: false, id: null, error: `${e.message ?? `Loopdesk HTTP ${status}`}${e.code ? ` (${e.code})` : ""}`, code: typeof e.metaCode === "number" ? e.metaCode : undefined };
}

export async function hubSend(hubBusinessId: string, to: string, message: Record<string, unknown>): Promise<HubSendResult> {
  const api = loopdeskApiUrl();
  if (!api) return { ok: false, id: null, error: "Loopdesk AI connection not set up on this server (LOOPDESK_API_URL)" };
  try {
    const res = await fetch(`${api}/api/hub/tools/regulars/whatsapp/send`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await signToolToken(hubBusinessId, "whatsapp-send")}` },
      body: JSON.stringify({ to: to.replace(/\D/g, ""), message }),
      signal: AbortSignal.timeout(20000),
    });
    return hubAnswer(res.status, await res.json().catch(() => ({})));
  } catch (err) {
    return { ok: false, id: null, error: `Could not reach Loopdesk AI: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Keep Loopdesk's STOP list in step when someone says STOP / START here. Never throws. */
export async function hubSetOptIn(hubBusinessId: string, to: string, optIn: boolean): Promise<void> {
  const api = loopdeskApiUrl();
  if (!api) return;
  await fetch(`${api}/api/hub/tools/regulars/whatsapp/opt-in`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${await signToolToken(hubBusinessId, "whatsapp-opt-in")}` },
    body: JSON.stringify({ to: to.replace(/\D/g, ""), optIn }),
    signal: AbortSignal.timeout(15000),
  }).catch(() => {});
}
