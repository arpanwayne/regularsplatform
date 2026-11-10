import { prisma } from "@/lib/prisma";
import { runSegmentationForBusiness } from "@/lib/run-segmentation";
import { planForBusiness } from "@/lib/growth/planner";
import { executeApproved } from "@/lib/growth/executor";
import { sendDailyBrief, sendWeeklyReport } from "@/lib/growth/brief";
import { getSettings, localParts } from "@/lib/growth/settings";

/**
 * One tick of the loop for one business (the hourly cron calls this):
 *  - first tick at/after the brief hour each day: re-segment, plan, brief the owner
 *  - every tick: run approved actions (contact-hour checks are in the executor)
 *  - Mondays: weekly report
 */
export async function tick(businessId: string, now = new Date()) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id: businessId } });
  const s = await getSettings(business);
  if (!s.enabled || business.status !== "ACTIVE") return { businessId, skipped: true };
  const { date, hour, weekday } = localParts(now, s.timezone);
  const out: Record<string, unknown> = { businessId };
  if (hour >= s.briefHour && s.lastPlanDate !== date) {
    await runSegmentationForBusiness(businessId);
    const plan = await planForBusiness(businessId, now);
    out.planned = plan.created.length;
    out.brief = (await sendDailyBrief(businessId, now)).sent;
  }
  out.executed = (await executeApproved(businessId, now)).filter((r) => r.status === "DONE").length;
  if (weekday === "Mon" && hour >= s.briefHour) out.report = !!(await sendWeeklyReport(businessId, now));
  return out;
}

export async function tickAll(now = new Date()) {
  const rows = await prisma.growthSettings.findMany({ where: { enabled: true }, select: { businessId: true } });
  const results = [];
  for (const r of rows) {
    try { results.push(await tick(r.businessId, now)); }
    catch (err) { results.push({ businessId: r.businessId, error: err instanceof Error ? err.message : String(err) }); }
  }
  return results;
}
