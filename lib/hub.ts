import { prisma } from "@/lib/prisma";
import { hubSecret, verifyHubJwt, type HubClaims, type HubPurpose } from "@/lib/hub-rules";

export class HubAuthError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}

/**
 * Verify a Loopdesk token and burn its jti, so it works exactly once.
 * Throws HubAuthError (503 when HUB_SECRET isn't set on this server).
 */
export async function useHubToken(token: string | null | undefined, purpose: HubPurpose): Promise<HubClaims> {
  const secret = hubSecret();
  if (!secret) throw new HubAuthError("Loopdesk connection is not set up on this server (HUB_SECRET missing)", 503);
  if (!token) throw new HubAuthError("Missing token");

  let claims: HubClaims;
  try {
    claims = await verifyHubJwt(token, secret, purpose);
  } catch {
    throw new HubAuthError("Invalid or expired token");
  }

  // Housekeeping: forget tokens that can no longer be used anyway.
  await prisma.hubTokenUse.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});
  try {
    await prisma.hubTokenUse.create({ data: { jti: claims.jti, expiresAt: new Date(claims.exp * 1000) } });
  } catch (err) {
    // P2002 = unique constraint: this jti was used before.
    if ((err as { code?: string } | null)?.code === "P2002") throw new HubAuthError("Token already used");
    throw err;
  }
  return claims;
}
