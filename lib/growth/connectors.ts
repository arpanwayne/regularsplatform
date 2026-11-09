import type { GrowthSettings } from "@prisma/client";

/**
 * The brain's tools in the other Bundle A products. Every connector is
 * optional: `available()` says whether it's set up, and the planner never
 * proposes an action whose tool is missing.
 *
 *  WayneRing     AI callback   POST {base}/api/integrations/growth/callback   (per-business wrcb_ key)
 *  GMB Manager   posts/reviews /api/locations/{id}/posts|reviews             (service login from env)
 *  Video Studio  promo Reel    POST /api/v1/jobs/                             (service login from env)
 */

export class ToolError extends Error {
  constructor(public code: string, message: string, public retryAt?: string) { super(message); }
}

async function call<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ToolError(String(body.code ?? `HTTP_${res.status}`), String(body.error ?? body.detail ?? `HTTP ${res.status}`),
        typeof body.retryAt === "string" ? body.retryAt : undefined);
    }
    return body as T;
  } catch (err) {
    if (err instanceof ToolError) throw err;
    throw new ToolError("UNREACHABLE", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(t);
  }
}
const json = (body: unknown, token?: string): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
});
const trim = (u?: string | null) => (u ?? "").replace(/\/$/, "");

// ── WayneRing ────────────────────────────────────────────────────────────
export const wayneRing = {
  available: (s: GrowthSettings) => !!((s.wayneRingBaseUrl || process.env.WAYNERING_API_URL) && s.wayneRingCallbackKey),
  async callback(s: GrowthSettings, p: { phone: string; name?: string | null; purpose: "MISSED_LEAD" | "QUOTE_FOLLOWUP" | "SERVICE_DUE" | "WINBACK"; context?: string; relationship: "caller" | "customer"; actionId: string }) {
    const base = trim(s.wayneRingBaseUrl || process.env.WAYNERING_API_URL);
    return call<{ callId: string; vapiCallId: string | null; status: string }>(
      `${base}/api/integrations/growth/callback`,
      json({ phone: p.phone.startsWith("+") ? p.phone : `+${p.phone}`, name: p.name ?? undefined, purpose: p.purpose, context: p.context, relationship: p.relationship, actionId: p.actionId }, s.wayneRingCallbackKey!),
    );
  },
};

// ── service logins (GMB Manager, Video Studio), cached per process ────────
const tokens = new Map<string, { token: string; at: number }>();
async function serviceToken(key: string, login: () => Promise<string>) {
  const hit = tokens.get(key);
  if (hit && Date.now() - hit.at < 20 * 60 * 1000) return hit.token;
  const token = await login();
  tokens.set(key, { token, at: Date.now() });
  return token;
}

// ── GMB Manager ──────────────────────────────────────────────────────────
const gmbBase = () => trim(process.env.GMB_API_URL);
const gmbToken = () => serviceToken("gmb", async () => {
  const r = await call<{ access_token: string }>(`${gmbBase()}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: process.env.GMB_SERVICE_EMAIL ?? "", password: process.env.GMB_SERVICE_PASSWORD ?? "" }).toString(),
  });
  return r.access_token;
});

export type GmbReview = { id: string; reviewer_name?: string | null; star_rating?: number | null; comment?: string | null; posted_at?: string | null; ai_draft_reply?: string | null; reply_text?: string | null };

export const gmb = {
  available: (s: GrowthSettings) => !!(gmbBase() && process.env.GMB_SERVICE_EMAIL && s.gmbLocationId),
  async unrepliedReviews(s: GrowthSettings): Promise<GmbReview[]> {
    const t = await gmbToken();
    const all = await call<GmbReview[]>(`${gmbBase()}/api/locations/${s.gmbLocationId}/reviews`, { headers: { authorization: `Bearer ${t}` } });
    return (Array.isArray(all) ? all : []).filter((r) => !r.reply_text);
  },
  async draftReply(s: GrowthSettings, reviewId: string) {
    const t = await gmbToken();
    const r = await call<GmbReview>(`${gmbBase()}/api/locations/${s.gmbLocationId}/reviews/${reviewId}/draft-reply`, json({}, t));
    return r.ai_draft_reply ?? "";
  },
  async reply(s: GrowthSettings, reviewId: string, text: string) {
    const t = await gmbToken();
    return call<GmbReview>(`${gmbBase()}/api/locations/${s.gmbLocationId}/reviews/${reviewId}/reply`, json({ reply_text: text }, t));
  },
  /** Generate (GMB Manager's own AI) → save → publish. */
  async publishPost(s: GrowthSettings, p: { postType: "update" | "offer"; prompt: string; ctaUrl?: string | null }) {
    const t = await gmbToken();
    const base = `${gmbBase()}/api/locations/${s.gmbLocationId}/posts`;
    const gen = await call<{ title?: string; body?: string }>(`${base}/generate`, json({ post_type: p.postType, prompt_text: p.prompt }, t), );
    const post = await call<{ id: string }>(`${base}?ai_generated=true`, json({
      post_type: p.postType, title: gen.title || p.prompt.slice(0, 58), body: gen.body ?? p.prompt,
      cta_type: p.ctaUrl ? "BOOK" : null, cta_url: p.ctaUrl ?? null,
      // Google rejects an offer that has no dates.
      ...(p.postType === "offer" ? { event_start: new Date().toISOString(), event_end: new Date(Date.now() + 14 * 86400000).toISOString() } : {}),
    }, t));
    return call<{ id: string; status: string; google_post_id?: string }>(`${base}/${post.id}/publish`, json({}, t));
  },
};

// ── AI Video Studio ─────────────────────────────────────────────────────
const videoBase = () => trim(process.env.VIDEO_STUDIO_API_URL);
const videoToken = () => serviceToken("video", async () => {
  const r = await call<{ access_token: string }>(`${videoBase()}/auth/login`,
    json({ email: process.env.VIDEO_STUDIO_EMAIL, password: process.env.VIDEO_STUDIO_PASSWORD }));
  return r.access_token;
});

export const videoStudio = {
  available: (s: GrowthSettings) => !!(videoBase() && process.env.VIDEO_STUDIO_EMAIL && s.videoStudioClientId),
  /** Starts a short promo video job; the team reviews it in Video Studio before it's posted anywhere. */
  async promoReel(s: GrowthSettings, p: { name: string; brief: string; overlay?: string }) {
    const t = await videoToken();
    return call<{ job_id: number; state: string }>(`${videoBase()}/api/v1/jobs/`, json({
      client_id: Number(s.videoStudioClientId), name: p.name, brief_text: p.brief, job_type: "smart_video",
      mode: "economy", num_shots: 3, overlay_text: p.overlay ?? null,
    }, t), );
  },
};
