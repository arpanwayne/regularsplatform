import type { Business } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logEvent } from "@/lib/logger";
import { getSettings } from "@/lib/growth/settings";
import type { FrontDeskPlan } from "@/lib/types";
import { BUNDLE_PLANS, GRACE_DAYS, PERIOD_DAYS, bundleLive, smsLimitFor } from "@/lib/hub/plans";
import { provisionBusiness } from "@/lib/hub/provision";

const DAY = 86400000;

/**
 * One bill turns everything on: sets the plan and paid period, switches the
 * Growth Manager on for plans that include it, and sets up every tool.
 * Paying again before the period ends extends it from the current end date.
 */
export async function activateBundle(businessId: string, plan: FrontDeskPlan, opts: { days?: number; reason: string; now?: Date }) {
  const now = opts.now ?? new Date();
  const biz = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const from = biz.bundlePaidUntil && biz.bundlePaidUntil > now && biz.frontDeskPlan === plan ? biz.bundlePaidUntil : now;
  const paidUntil = new Date(from.getTime() + (opts.days ?? PERIOD_DAYS) * DAY);

  await prisma.business.update({
    where: { id: businessId },
    data: { frontDeskPlan: plan, bundleStatus: "ACTIVE", bundlePaidUntil: paidUntil, smsMonthlyLimit: smsLimitFor(plan) },
  });
  await getSettings(biz);
  if (BUNDLE_PLANS[plan].growthManager) {
    await prisma.growthSettings.update({ where: { businessId }, data: { enabled: true } });
  }
  await logEvent({ businessId, source: "BILLING", level: "INFO", message: `Bundle ${plan} active until ${paidUntil.toISOString().slice(0, 10)} (${opts.reason})` });
  const tools = await provisionBusiness(businessId);
  return { paidUntil, tools };
}

/**
 * After the paid period plus a short grace, pause the tools (accounts and
 * data are kept, nothing is deleted) and stop the Growth Manager. Paying
 * again turns everything back on.
 */
export async function lapseBundleIfExpired<B extends Business>(business: B, now = new Date()): Promise<B> {
  if (business.bundleStatus !== "ACTIVE" || bundleLive(business, now)) return business;
  const updated = await prisma.business.update({ where: { id: business.id }, data: { bundleStatus: "LAPSED" } });
  await prisma.growthSettings.updateMany({ where: { businessId: business.id }, data: { enabled: false } });
  await logEvent({ businessId: business.id, source: "BILLING", level: "INFO", message: `Bundle lapsed ${GRACE_DAYS} days after the paid period ended; tools paused` });
  await provisionBusiness(business.id).catch(() => []);
  return { ...business, ...updated };
}

export async function sweepLapsedBundles(now = new Date()) {
  const cutoff = new Date(now.getTime() - GRACE_DAYS * DAY);
  const due = await prisma.business.findMany({ where: { bundleStatus: "ACTIVE", bundlePaidUntil: { lt: cutoff } } });
  for (const b of due) await lapseBundleIfExpired(b, now);
  return due.length;
}
