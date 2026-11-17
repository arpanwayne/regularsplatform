import type { Business } from "@prisma/client";
import { BUNDLE_PLANS, isBundlePlan } from "@/lib/hub/plans";

/**
 * Which businesses get the AI Growth Manager (bug B9: a Starter business
 * was planning and sending win-backs although Settings says win-backs are
 * an Answer + Return / Grow feature).
 *
 *  - Bundle A: plans with growthManager (Answer + Return, Grow) while the
 *    bundle is ACTIVE.
 *  - Regulars-only: the paid GROWTH and PRO plans.
 *  - Custom bundles: when the bundle has "Growth Manager" ticked.
 *  - Starter (free) and Answer: no.
 *
 * To demo it on a test business, put that business on PRO from
 * Admin → Businesses.
 */
export function growthAllowed(b: Pick<Business, "plan" | "frontDeskPlan" | "bundleStatus"> & Partial<Pick<Business, "customBundleId" | "bundleGrowth">>): boolean {
  // A custom bundle (Admin → Products & Bundles) says itself whether it includes it.
  if (b.bundleStatus !== "NONE" && b.customBundleId) return b.bundleStatus === "ACTIVE" && !!b.bundleGrowth;
  if (b.bundleStatus !== "NONE" && isBundlePlan(b.frontDeskPlan)) {
    return b.bundleStatus === "ACTIVE" && BUNDLE_PLANS[b.frontDeskPlan].growthManager;
  }
  return b.plan === "GROWTH" || b.plan === "PRO";
}

export const GROWTH_UPGRADE_MESSAGE =
  "The Growth Manager is part of the Growth and Pro plans (and the Answer + Return and Grow bundles). Upgrade on the Billing page to switch it on.";
