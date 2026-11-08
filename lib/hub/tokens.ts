import { randomBytes } from "crypto";
import { SignJWT } from "jose";
import { TOOL_META, type Tool } from "@/lib/hub/plans";

/**
 * Hub → tool tokens. Each tool shares one secret with the hub
 * (HUB_SECRET_<TOOL> here, HUB_SECRET there), so a leak in one tool can't
 * be used against another. Tokens are HS256 JWTs:
 *
 *   iss "regulars-hub"   aud <tool audience>   sub <Regulars business id>
 *   purpose "provision" | "sso"   jti (single use)   exp ≤ 2 minutes
 *
 * "provision" authenticates the hub's server-to-server set-up call.
 * "sso" is handed to the owner's browser and exchanged once by the tool for
 * its own session.
 */
export const ISSUER = "regulars-hub";
export const AUDIENCE: Record<Tool, string> = { WAYNERING: "wayneRing", FIELD_SERVICE: "fieldService", GMB: "gmb", VIDEO: "videoStudio" };

export function toolSecret(tool: Tool): string | null {
  const v = process.env[TOOL_META[tool].secretEnv];
  return v && v.length >= 32 ? v : null;
}

export function toolUrl(tool: Tool, kind: "api" | "app"): string | null {
  const env = kind === "api" ? TOOL_META[tool].apiEnv : TOOL_META[tool].appEnv;
  const v = env ? process.env[env] : undefined;
  return v ? v.replace(/\/$/, "") : null;
}

export async function signHubToken(tool: Tool, purpose: "provision" | "sso", sub: string, claims: Record<string, unknown> = {}, ttlSeconds = 60) {
  const secret = toolSecret(tool);
  if (!secret) throw new Error(`${TOOL_META[tool].secretEnv} is not set (needs 32+ characters)`);
  return new SignJWT({ ...claims, purpose })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE[tool])
    .setSubject(sub)
    .setJti(randomBytes(12).toString("hex"))
    .setIssuedAt()
    .setExpirationTime(`${Math.min(ttlSeconds, 120)}s`)
    .sign(new TextEncoder().encode(secret));
}
