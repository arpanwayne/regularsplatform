import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const clientIp = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/**
 * Counts attempts in the database, because serverless instances share no
 * memory. If the database call fails, the request is allowed: a limiter
 * problem shouldn't lock everyone out of their account.
 */
export async function allow(key: string, limit: number, windowMs: number) {
  try {
    const now = new Date();
    const row = await prisma.rateLimit.findUnique({ where: { key } });
    if (!row || row.resetAt <= now) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt: new Date(now.getTime() + windowMs) },
        update: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
      });
      return true;
    }
    if (row.count >= limit) return false;
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return true;
  } catch {
    return true;
  }
}
