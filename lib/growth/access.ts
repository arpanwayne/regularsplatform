import type { Business } from "@prisma/client";

/**
 * Which businesses get the AI Growth Manager (bug B9: a Starter business
 * was planning and sending win-backs although Settings says win-backs are
 * a paid feature).
 *
 *  - The paid GROWTH and PRO plans: yes.
 *  - Starter (free): no.
 *
 * To demo it on a test business, put that business on PRO from
 * Admin → Businesses.
 */
export function growthAllowed(b: Pick<Business, "plan">): boolean {
  return b.plan === "GROWTH" || b.plan === "PRO";
}

export const GROWTH_UPGRADE_MESSAGE =
  "The Growth Manager is part of the Growth and Pro plans. Upgrade on the Billing page to switch it on.";
