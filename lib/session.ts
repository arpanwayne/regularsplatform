import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { downgradeIfExpired } from "@/lib/billing";
import { lapseBundleIfExpired } from "@/lib/hub/bundle";

// Server-side helper for Server Components and route handlers: resolves the
// signed-in user and their business — the owner's first business (MVP is
// single-business-per-owner in the UI, though the schema supports many), or
// for a MANAGER the one business they work in.
export async function getCurrentUser() {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (user?.sessionsValidFrom && (payload.iat ?? 0) * 1000 < user.sessionsValidFrom.getTime() - 1000) return null;
  return user;
}

async function businessForUser(user: User) {
  const owned = await prisma.business.findFirst({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });
  if (owned) return owned;
  // A manager works in the business that added them (Dashboard → Team).
  if (user.role === "MANAGER" && user.managedBusinessId) {
    return prisma.business.findUnique({ where: { id: user.managedBusinessId } });
  }
  return null;
}

export async function getCurrentBusiness() {
  const user = await getCurrentUser();
  if (!user) return null;

  const business = await businessForUser(user);
  if (!business) return null;
  // Lazy auto-downgrade: cheap no-op when the plan hasn't lapsed, so this
  // is safe to call on every request rather than needing a cron to run
  // first (the cron sweep in app/api/cron/downgrade-expired-plans covers
  // businesses nobody is actively viewing).
  return lapseBundleIfExpired(await downgradeIfExpired(business));
}

/**
 * The signed-in user, their business, and whether they own it. Managers can
 * add customers, write offers and use the inbox; billing, settings, team,
 * approval limits and the Growth Manager stay with the owner.
 */
export async function getCurrentMember() {
  const user = await getCurrentUser();
  if (!user) return null;
  const business = await getCurrentBusiness();
  if (!business) return null;
  return { user, business, isOwner: business.ownerId === user.id };
}

/** The business, only when the signed-in user owns it (owner-only API routes). Null for managers. */
export async function getOwnerBusiness() {
  const member = await getCurrentMember();
  return member?.isOwner ? member.business : null;
}

/** For owner-only pages: a manager who opens one is sent to the dashboard home. */
export async function getOwnerBusinessOrRedirect() {
  const member = await getCurrentMember();
  if (!member) return null;
  if (!member.isOwner) redirect("/dashboard");
  return member.business;
}
