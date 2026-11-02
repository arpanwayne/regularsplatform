import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Server-to-server API keys for the inbound events API. Format:
// "rk_live_" + 40 hex chars. Only the SHA-256 hash is stored.

const PREFIX = "rk_live_";

export function hashApiKey(plain: string) {
  return createHash("sha256").update(plain).digest("hex");
}

export function generateApiKey() {
  const plain = PREFIX + randomBytes(20).toString("hex");
  return { plain, keyHash: hashApiKey(plain), keyPrefix: plain.slice(0, PREFIX.length + 6) };
}

/**
 * Resolves `Authorization: Bearer <key>` to its business. Returns null for a
 * missing, unknown or revoked key. A suspended business is returned with
 * `suspended: true` so the caller can answer 403 rather than 401.
 */
export async function authenticateApiKey(req: NextRequest) {
  const header = req.headers.get("authorization") ?? "";
  const plain = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!plain.startsWith(PREFIX)) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(plain) },
    include: { business: { include: { locations: { select: { id: true, name: true, status: true }, orderBy: { createdAt: "asc" } } } } },
  });
  if (!apiKey || apiKey.revokedAt) return null;

  // Best-effort; never block the request on it.
  prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});

  return { apiKey, business: apiKey.business, suspended: apiKey.business.status === "SUSPENDED" };
}
