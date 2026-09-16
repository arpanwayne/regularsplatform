import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { downgradeIfExpired } from "@/lib/billing";

// Server-side helper for Server Components and route handlers: resolves the
// signed-in owner and their first business (MVP is single-business-per-owner
// in the UI, though the schema supports many).
export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  return user;
}

export async function getCurrentBusiness() {
  const user = await getCurrentUser();
  if (!user) return null;

  const business = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (!business) return null;
  // Lazy auto-downgrade: cheap no-op when the plan hasn't lapsed, so this
  // is safe to call on every request rather than needing a cron to run
  // first (the cron sweep in app/api/cron/downgrade-expired-plans covers
  // businesses nobody is actively viewing).
  return downgradeIfExpired(business);
}
