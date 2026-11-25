import { jwtVerify, type JWTPayload } from "jose";
import { SECTORS, type Sector } from "@/lib/types";

/**
 * Loopdesk AI → Regulars connection: the rules, with no database access
 * (unit-tested in test/loopdesk-connection.test.ts). lib/hub.ts and the
 * /api/hub routes do the reads and writes.
 *
 * Loopdesk AI is the hub. Regulars is one of its tools, like Korvo and
 * Loyvexa: Loopdesk creates the client's Regulars account when a bundle
 * includes Regulars, pauses it when the bundle lapses or drops Regulars, and
 * signs the owner in with one click (no second password).
 *
 * Tokens are HS256 JWTs signed with HUB_SECRET (Loopdesk: HUB_SECRET_REGULARS):
 *   iss "regulars-hub"  aud "regulars"  sub <Loopdesk business id>
 *   purpose "provision" | "sso"   jti (single use)   exp ≤ 2 minutes
 * The issuer name is Loopdesk's, kept from when Regulars was the hub, so every
 * tool checks the same value.
 */
export const HUB_ISSUER = "regulars-hub";
export const HUB_AUDIENCE = "regulars";
export const MAX_TOKEN_AGE_SECONDS = 120;

export type HubPurpose = "provision" | "sso";
export type HubClaims = JWTPayload & { sub: string; jti: string; exp: number; purpose: HubPurpose; [k: string]: unknown };

export function hubSecret(env: Record<string, string | undefined> = process.env): Uint8Array | null {
  const v = env.HUB_SECRET;
  return v && v.length >= 32 ? new TextEncoder().encode(v) : null;
}

/** Checks signature, issuer, audience, age and purpose. Single use (jti) is checked by the caller. */
export async function verifyHubJwt(token: string, secret: Uint8Array, purpose: HubPurpose): Promise<HubClaims> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: HUB_ISSUER,
    audience: HUB_AUDIENCE,
    algorithms: ["HS256"],
    maxTokenAge: `${MAX_TOKEN_AGE_SECONDS}s`,
  });
  if (payload.purpose !== purpose) throw new Error("Wrong token purpose");
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Token has no business");
  if (typeof payload.jti !== "string" || !payload.jti) throw new Error("Token has no id");
  if (typeof payload.exp !== "number") throw new Error("Token has no expiry");
  return payload as HubClaims;
}

/** "Bearer abc" → "abc". */
export function bearer(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(header ?? "");
  return m ? m[1].trim() : null;
}

/**
 * Pause / resume from Loopdesk. Loopdesk only lifts a suspension it made
 * itself; a super admin's suspension stays. Null = nothing to change.
 */
export function hubStatusChange(biz: { status: string; hubSuspended: boolean }, active: boolean): { status: string; hubSuspended: boolean } | null {
  if (!active) {
    if (biz.status === "SUSPENDED") return null; // already off (ours or an admin's)
    return { status: "SUSPENDED", hubSuspended: true };
  }
  if (biz.status === "SUSPENDED" && biz.hubSuspended) return { status: "ACTIVE", hubSuspended: false };
  return null;
}

/** What Loopdesk sees: ACTIVE, or PAUSED for any suspension. */
export const hubAnswerStatus = (status: string): "ACTIVE" | "PAUSED" => (status === "SUSPENDED" ? "PAUSED" : "ACTIVE");

/** Loopdesk sectors are the same list; anything unknown becomes OTHER. */
export function toSector(s: string | null | undefined): Sector {
  const up = (s ?? "").toUpperCase();
  return (SECTORS as string[]).includes(up) ? (up as Sector) : "OTHER";
}

/** Where to land after one-login: a page in this app only, never another site. */
export function safeNext(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}

/**
 * Which account a new Loopdesk client gets, by the owner's email:
 * - no Regulars login with that email → create the owner and the business
 * - an owner whose first business isn't linked yet → link that business, so a
 *   client who already used Regulars keeps their customers
 * - an owner with no business → create the business for them
 * - an owner whose first business belongs to another Loopdesk client, or a
 *   manager / super admin login → refuse (our team sorts it out)
 */
export type OwnerMatch =
  | { kind: "create-owner" }
  | { kind: "link-business"; businessId: string }
  | { kind: "create-business"; userId: string }
  | { kind: "refuse"; reason: string };

export function matchOwner(
  user: { id: string; role: string } | null,
  firstBusiness: { id: string; hubBusinessId: string | null } | null,
): OwnerMatch {
  if (!user) return { kind: "create-owner" };
  if (user.role !== "OWNER") return { kind: "refuse", reason: "This email is a manager or admin login in Regulars. Use a different owner email." };
  if (!firstBusiness) return { kind: "create-business", userId: user.id };
  if (firstBusiness.hubBusinessId) return { kind: "refuse", reason: "This owner's Regulars business is already linked to another Loopdesk AI client." };
  return { kind: "link-business", businessId: firstBusiness.id };
}

/**
 * Plan for a Loopdesk client: full features (PRO) with no Regulars expiry
 * date. Loopdesk bills and pauses; Regulars' own Starter/Growth/Pro checkout
 * and auto-downgrade don't apply.
 */
export const HUB_PLAN = { plan: "PRO", planExpiresAt: null } as const;
